import * as github from './github.js';
import * as linear from './linear.js';
import * as worktree from './worktree.js';
import * as tmux from './tmux.js';
import { loadConfig, saveConfig } from './config-store.js';
import { WORKTREE_REPO_PATH } from '../config/env.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class AutopilotController {
  constructor() {
    this.config = {
      enabled: false,
      maxParallelAgents: 3,
      pollIntervalSeconds: 10
    };
    this.pollInterval = null;
    this.isPolling = false;
  }

  /**
   * Initialize: Load config from disk
   */
  async init() {
    console.log('🔧 [Autopilot] Initializing...');
    this.config = await loadConfig();
    console.log('✅ [Autopilot] Config loaded:', this.config);

    // If was enabled, restart polling
    if (this.config.enabled) {
      console.log('🔄 [Autopilot] Was enabled, restarting...');
      await this.start();
    }
  }

  /**
   * Start autopilot polling
   */
  async start() {
    if (this.pollInterval) {
      console.log('⚠️  [Autopilot] Already running');
      return { ok: false, error: 'Already running' };
    }

    console.log('🚀 [Autopilot] Starting...');
    console.log(`   Max parallel agents: ${this.config.maxParallelAgents}`);
    console.log(`   Poll interval: ${this.config.pollIntervalSeconds}s`);

    this.config.enabled = true;
    await saveConfig(this.config);

    // Start polling loop
    this.pollInterval = setInterval(() => {
      if (this.config.enabled && !this.isPolling) {
        this.pollOnce().catch(err => {
          console.error('❌ [Autopilot] Poll failed:', err);
        });
      }
    }, this.config.pollIntervalSeconds * 1000);

    // Run first poll immediately
    setImmediate(() => {
      this.pollOnce().catch(err => {
        console.error('❌ [Autopilot] First poll failed:', err);
      });
    });

    console.log('✅ [Autopilot] Started');
    return { ok: true };
  }

  /**
   * Stop autopilot polling
   */
  async stop() {
    if (!this.config.enabled) {
      console.log('⚠️  [Autopilot] Not running');
      return { ok: false, error: 'Not running' };
    }

    console.log('🛑 [Autopilot] Stopping...');

    this.config.enabled = false;
    await saveConfig(this.config);

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    console.log('✅ [Autopilot] Stopped');
    return { ok: true };
  }

  /**
   * Update max parallel agents
   */
  async setMaxParallel(max) {
    const num = parseInt(max, 10);
    if (isNaN(num) || num < 1 || num > 10) {
      return { ok: false, error: 'Max must be between 1 and 10' };
    }

    console.log(`⚙️  [Autopilot] Setting max parallel agents: ${num}`);
    this.config.maxParallelAgents = num;
    await saveConfig(this.config);

    return { ok: true };
  }

  /**
   * Get current status
   */
  async getStatus() {
    const claudeSessions = await tmux.listAllSessions();
    const runningAgents = claudeSessions.filter(s => s.name.endsWith('-claude'));

    return {
      enabled: this.config.enabled,
      maxParallelAgents: this.config.maxParallelAgents,
      pollIntervalSeconds: this.config.pollIntervalSeconds,
      runningAgentsCount: runningAgents.length,
      runningSessions: runningAgents.map(s => s.name),
      isPolling: this.isPolling
    };
  }

  /**
   * Main polling logic - ONE poll cycle
   */
  async pollOnce() {
    if (this.isPolling) {
      console.log('⏭️  [Autopilot] Already polling, skipping');
      return;
    }

    this.isPolling = true;
    console.log('\n🔄 [Autopilot] ===== POLL START =====');

    try {
      // Safety check: Ensure WORKTREE_REPO_PATH is configured
      if (!WORKTREE_REPO_PATH) {
        console.error('❌ [Autopilot] WORKTREE_REPO_PATH not configured');
        return;
      }

      // Step 1: Get open PRs
      const baseBranch = process.env.DEFAULT_BASE_BRANCH || 'main';
      const openPRs = await github.getOpenPRsToBase(baseBranch);

      if (openPRs.length === 0) {
        console.log(`✅ [Autopilot] No open PRs to ${baseBranch}`);
        return;
      }

      console.log(`📋 [Autopilot] Found ${openPRs.length} open PRs`);

      // Step 2: Filter PRs by Linear status - exclude In Progress, In Review, Done
      const eligiblePRs = [];
      for (const pr of openPRs) {
        const branch = pr.head.ref;

        // Extract issue identifier from branch (e.g., A-273 from feature/a-273-...)
        const identifierMatch = branch.match(/([A-Z]+-\d+)/i);

        if (!identifierMatch) {
          console.log(`  ⏭️  [Autopilot] PR #${pr.number} (${branch}) - no issue identifier, skipping`);
          continue;
        }

        const identifier = identifierMatch[1].toUpperCase();

        try {
          // Check Linear status
          const issue = await linear.getIssue(identifier);

          if (!issue) {
            console.log(`  ⏭️  [Autopilot] PR #${pr.number} (${identifier}) - issue not found in Linear, skipping`);
            continue;
          }

          const stateType = issue.state?.type || '';
          const stateName = (issue.state?.name || '').toLowerCase();

          // Skip if in progress, in review, or completed
          if (stateType === 'started') {
            console.log(`  ⏭️  [Autopilot] PR #${pr.number} (${identifier}) - in progress, skipping`);
            continue;
          }

          if (stateName.includes('review')) {
            console.log(`  ⏭️  [Autopilot] PR #${pr.number} (${identifier}) - in review, skipping`);
            continue;
          }

          if (stateType === 'completed') {
            console.log(`  ⏭️  [Autopilot] PR #${pr.number} (${identifier}) - completed, skipping`);
            continue;
          }

          console.log(`  ✓ [Autopilot] PR #${pr.number} (${identifier}) - eligible (${stateName})`);
          eligiblePRs.push({ ...pr, identifier, issue });

        } catch (error) {
          console.log(`  ⚠️  [Autopilot] PR #${pr.number} (${identifier}) - error checking Linear: ${error.message}`);
          continue;
        }
      }

      if (eligiblePRs.length === 0) {
        console.log('✅ [Autopilot] No eligible PRs (all are in progress, in review, or done)');
        return;
      }

      console.log(`📋 [Autopilot] ${eligiblePRs.length} eligible PRs`);

      // Step 3: Get existing worktrees
      console.log('📁 [Autopilot] Checking existing worktrees...');
      const allWorktrees = await worktree.listWorktrees(WORKTREE_REPO_PATH);
      console.log(`   Found ${allWorktrees.length} worktrees`);

      // Step 4: Filter PRs that need agents (no worktree yet)
      const needsAgent = [];
      for (const pr of eligiblePRs) {
        const branch = pr.head.ref;
        const hasWorktree = allWorktrees.some(wt =>
          wt.branch && wt.branch === branch
        );

        if (hasWorktree) {
          console.log(`  ✓ [Autopilot] PR #${pr.number} (${branch}) - worktree exists, skipping`);
        } else {
          console.log(`  → [Autopilot] PR #${pr.number} (${branch}) - needs agent`);
          needsAgent.push(pr);
        }
      }

      if (needsAgent.length === 0) {
        console.log('✅ [Autopilot] All eligible PRs have worktrees');
        return;
      }

      // Step 4: Count running agents
      const claudeSessions = await tmux.listAllSessions();
      const runningAgents = claudeSessions.filter(s => s.name.endsWith('-claude'));
      console.log(`🤖 [Autopilot] Running agents: ${runningAgents.length}/${this.config.maxParallelAgents}`);

      // Step 5: Spawn agents up to limit
      const availableSlots = this.config.maxParallelAgents - runningAgents.length;

      if (availableSlots <= 0) {
        console.log(`⏸️  [Autopilot] Max agents reached, waiting for slots`);
        return;
      }

      const toSpawn = needsAgent.slice(0, availableSlots);
      console.log(`🚀 [Autopilot] Spawning ${toSpawn.length} agent(s)...`);

      for (const pr of toSpawn) {
        await this.spawnAgent(pr);
      }

    } catch (error) {
      console.error('❌ [Autopilot] Poll error:', error);
    } finally {
      console.log('🔄 [Autopilot] ===== POLL END =====\n');
      this.isPolling = false;
    }
  }

  /**
   * Spawn a single agent for a PR
   */
  async spawnAgent(pr) {
    // Validate PR data
    if (!pr || !pr.number || !pr.head || !pr.head.ref) {
      console.error(`❌ [Autopilot] Invalid PR data:`, pr);
      return;
    }

    const prNumber = pr.number;
    const branch = pr.head.ref;
    const title = pr.title || 'Untitled PR';

    console.log(`\n🎯 [Autopilot] Spawning agent for PR #${prNumber}`);
    console.log(`   Title: ${title}`);
    console.log(`   Branch: ${branch}`);

    try {
      // Create worktree (includes .env and .claude copy)
      console.log(`   📁 Creating worktree...`);
      const wtResult = await worktree.createWorktree(branch);

      if (!wtResult.ok) {
        throw new Error(wtResult.error || 'Worktree creation failed');
      }

      console.log(`   ✅ Worktree: ${wtResult.worktreePath}`);
      console.log(`   ${wtResult.existed ? '(already existed)' : '(newly created)'}`);

      // Create tmux session with Claude
      console.log(`   🖥️  Creating tmux session...`);

      // Extract identifier from branch (e.g., A-273 from feature/a-273-...)
      const identifierMatch = branch.match(/([A-Z]+-\d+)/i);
      const identifier = identifierMatch ? identifierMatch[1].toUpperCase() : `PR-${prNumber}`;

      const { sessionName, created } = await tmux.createClaudeSession(
        branch,
        wtResult.worktreePath,
        title,
        identifier
      );

      console.log(`   ✅ Tmux session: ${sessionName}`);
      console.log(`   ${created ? '(newly created)' : '(already exists)'}`);

      // Send prompt if newly created
      if (created) {
        console.log(`   ⏳ Waiting for Claude to initialize (8s)...`);
        await sleep(8000);

        // Sanitize identifier to prevent path injection
        const safeIdentifier = identifier.replace(/[^A-Za-z0-9-]/g, '');
        const prompt = `fix issues/${safeIdentifier}.md and add tests`;
        console.log(`   📝 Sending prompt: "${prompt}"`);

        await tmux.sendKeys(sessionName, [prompt, 'C-m']);
        console.log(`   ✅ Prompt sent`);
      }

      console.log(`✅ [Autopilot] Agent spawned successfully for PR #${prNumber}\n`);

    } catch (error) {
      console.error(`❌ [Autopilot] Failed to spawn agent for PR #${prNumber}:`, error.message);
      console.error(`   Stack:`, error.stack);
    }
  }
}

function slugify(text) {
  if (!text || typeof text !== 'string') {
    return 'untitled';
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) || 'untitled';
}

// Singleton instance
export const autopilot = new AutopilotController();

// Initialize on module load
autopilot.init().catch(err => {
  console.error('❌ [Autopilot] Failed to initialize:', err);
});
