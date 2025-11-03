import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'config', 'autopilot-config.json');

const DEFAULT_CONFIG = {
  enabled: false,
  maxParallelAgents: 3,
  pollIntervalSeconds: 10
};

export async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(data);

    // Validate and sanitize loaded config
    const config = { ...DEFAULT_CONFIG };

    if (typeof parsed.enabled === 'boolean') {
      config.enabled = parsed.enabled;
    }

    if (typeof parsed.maxParallelAgents === 'number' &&
        parsed.maxParallelAgents >= 1 &&
        parsed.maxParallelAgents <= 10) {
      config.maxParallelAgents = parsed.maxParallelAgents;
    }

    if (typeof parsed.pollIntervalSeconds === 'number' &&
        parsed.pollIntervalSeconds >= 5 &&
        parsed.pollIntervalSeconds <= 60) {
      config.pollIntervalSeconds = parsed.pollIntervalSeconds;
    }

    return config;
  } catch (err) {
    // File doesn't exist or is corrupted, return defaults
    console.log('📝 [ConfigStore] Using default autopilot config');
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config) {
  try {
    // Ensure config directory exists
    await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('💾 [ConfigStore] Saved autopilot config:', config);
  } catch (err) {
    console.error('❌ [ConfigStore] Failed to save config:', err);
    throw err;
  }
}
