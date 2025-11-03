import { runCommand } from './command.js';

export async function openUrl(targetUrl) {
  const platform = process.platform;
  if (platform === 'darwin') {
    return runCommand('open', [targetUrl]);
  } else if (platform === 'win32') {
    return runCommand('cmd', ['/c', 'start', '', targetUrl]);
  } else {
    return runCommand('xdg-open', [targetUrl]);
  }
}

export async function openTerminal(directoryPath) {
  const platform = process.platform;
  if (platform === 'darwin') {
    console.log(`🚀 Opening Warp at: ${directoryPath}`);
    const warpResult = await runCommand('open', ['-a', 'Warp', directoryPath]);

    if (warpResult.code === 0) {
      console.log(`✅ Successfully opened Warp`);
      return warpResult;
    }

    // If Warp fails, fall back to default terminal
    console.log(`⚠️ Warp not available, falling back to default terminal`);
    return runCommand('open', ['-a', 'Terminal', directoryPath]);
  } else if (platform === 'win32') {
    return runCommand('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${directoryPath}"`]);
  } else {
    // Linux
    return runCommand('gnome-terminal', ['--working-directory', directoryPath]);
  }
}
