# Changelog

All notable changes to Forge are documented in this file.

## [Unreleased] - staging

### Added
- Auto-initialize git submodules when creating worktrees
- iTerm2 installation check in dashboard
- `.forge.example` configuration template
- Codex button next to Claude button in dashboard
- Multi-project Linear support with project-specific API keys
- Spec improvement features with Linear integration

### Changed
- Auto-upgrade claude-code before creating new sessions
- Simplify session prompt - issue file instructions moved to CLAUDE.md
- Move Linear ticket to In Progress when creating worktree
- Move Linear ticket to Done on cleanup instead of In Review
- Launch Claude CLI with --dangerously-skip-permissions
- Update Claude session prompt to avoid technical details in issue files
- Remove feature/ prefix from branch names
- Truncate long descriptions with expandable Show button (BOL-33)
- Improve issue sync conflict detection and diff normalization
- Rename from SDLC to Forge with updated branding

### Fixed
- Linear issue filtering to match branches by identifier prefix
- `getWorktrees` to use project-specific `WORKTREE_REPO_PATH` from .forge
- `improve-spec` handler to use project-specific Linear API key
- GitHub owner/repo to use project-specific .forge config
- Linear API key handling for project-specific configs

## [0.1.0] - 2025-12-01

### Added
- Multi-project support with dynamic project selection
- Branch creation and PR workflow for Linear issues
- Global CLI support (`forge` command)
- Linear integration with issue fetching and assignment
- Electron desktop shell with dashboard UI
- Git worktree management tied to Linear tickets
- GitHub PR status tracking per branch
- PostgreSQL database for GitHub token storage
- OpenRouter AI categorization support
- Render deployment status integration

### Changed
- Exclude backlog issues from Linear dashboard

### Initial Features
- Local HTTP server on port 4665
- Dashboard showing worktrees mapped to Linear tickets
- Status enrichment from Linear and GitHub
- Actions for branches, worktrees, PRs, and Linear state updates
