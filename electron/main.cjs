const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const forgePort = process.env.FORGE_PORT || process.env.LOCAL_AGENT_PORT || "4665";

// Ignore EPIPE errors (happens when stdout pipe breaks during restart)
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});
process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

// Classic rocketship icon (icon.png) for dock/window
const rocketIconPath = path.join(__dirname, "icon.png");
function createRocketIcon() {
  const img = nativeImage.createFromPath(rocketIconPath);
  if (!img.isEmpty()) {
    const size = img.getSize();
    console.log(`🚀 Loaded rocket icon: ${rocketIconPath} (${size.width}x${size.height})`);
    return img;
  }

  console.warn("⚠️ No usable rocket icon found; returning empty icon");
  return nativeImage.createEmpty();
}
const forgeIcon = createRocketIcon();

let win;
let serverProcess;

function startServer() {
  return new Promise((resolve, reject) => {
    console.log("🚀 Starting Forge server...");
    console.log("📍 App packaged:", app.isPackaged);
    console.log("📍 __dirname:", __dirname);
    console.log("📍 process.resourcesPath:", process.resourcesPath);

    // Determine the correct path based on whether app is packaged
    // Use app.asar.unpacked for files that need to be extracted from asar
    const forgeRoot = process.env.FORGE_ROOT || path.join(__dirname, "..");
    const serverPath = app.isPackaged
      ? path.join(process.resourcesPath, "app.asar.unpacked", "src", "index.js")
      : path.join(forgeRoot, "src", "index.js");

    console.log("📍 Server path:", serverPath);
    console.log("📍 Server exists:", require("fs").existsSync(serverPath));

    // Get the working directory (where .env/.forge should be)
    // Priority: FORGE_CONFIG_DIR (set by CLI) > packaged user data dir > dev mode dir
    const cwd = process.env.FORGE_CONFIG_DIR
      ? process.env.FORGE_CONFIG_DIR
      : (app.isPackaged
        ? app.getPath('userData')
        : path.join(__dirname, ".."));

    // In packaged mode, ensure .env.example exists in userData for reference
    if (app.isPackaged) {
      const envExampleSrc = path.join(process.resourcesPath, '.env.example');
      const envExampleDst = path.join(cwd, '.env.example');
      const envFile = path.join(cwd, '.env');

      try {
        if (require('fs').existsSync(envExampleSrc) && !require('fs').existsSync(envExampleDst)) {
          require('fs').copyFileSync(envExampleSrc, envExampleDst);
          console.log(`📝 Copied .env.example to ${envExampleDst}`);
        }
        if (!require('fs').existsSync(envFile)) {
          console.log(`⚠️  No .env file found at ${envFile}`);
          console.log(`💡 Copy .env.example to .env and configure your settings`);
        }
      } catch (err) {
        console.error('Error setting up env files:', err);
      }
    }

    console.log("📍 Working directory:", cwd);

    // Fix PATH to include common locations for git and other tools
    // Electron apps on macOS don't get the full shell PATH
    const additionalPaths = [
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/opt/homebrew/bin',
      '/opt/local/bin',
      '/Applications/Xcode.app/Contents/Developer/usr/bin'
    ];
    const existingPath = process.env.PATH || '';
    const fullPath = [...new Set([...existingPath.split(':'), ...additionalPaths])].join(':');
    console.log('📍 PATH:', fullPath);

    // Start the server process
    serverProcess = spawn("node", [serverPath], {
      cwd: forgeRoot,  // Run from forge root so relative imports work
      env: {
        ...process.env,
        PATH: fullPath,
        LOCAL_AGENT_CONFIG_DIR: cwd,  // Pass config directory to server
        FORGE_CONFIG_DIR: cwd,  // Also set FORGE_CONFIG_DIR for consistency
        FORGE_ROOT: forgeRoot,
        FORGE_PORT: forgePort
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    // Capture stdout
    serverProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      console.log("[SERVER]", msg);
    });

    // Capture stderr
    serverProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      console.error("[SERVER ERROR]", msg);
    });

    serverProcess.on("error", (err) => {
      console.error("❌ Failed to start server:", err);
      reject(err);
    });

    serverProcess.on("exit", (code, signal) => {
      console.log(`🛑 Server process exited with code ${code}, signal ${signal}`);
    });

    // Wait for server to be ready
    let attempts = 0;
    const checkServer = setInterval(async () => {
      attempts++;
      console.log(`⏳ Checking server health (attempt ${attempts})...`);
      try {
        const response = await fetch(`http://localhost:${forgePort}/health`);
        if (response.ok) {
          console.log("✅ Server is ready");
          clearInterval(checkServer);
          resolve();
        }
      } catch (e) {
        console.log(`⏳ Server not ready yet: ${e.message}`);
      }
    }, 500);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkServer);
      console.error("❌ Server startup timeout after 30 seconds");
      reject(new Error("Server startup timeout - check Console.app for logs"));
    }, 30000);
  });
}

async function createWindow() {
  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    if (!forgeIcon.isEmpty()) {
      app.dock.setIcon(forgeIcon);
    } else if (fs.existsSync(rocketIconPath)) {
      app.dock.setIcon(rocketIconPath);
    }
  }

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#080d1a",
    icon: forgeIcon.isEmpty() ? undefined : forgeIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show loading state
  win.loadURL(`data:text/html,
    <html>
      <body style="margin:0;background:radial-gradient(circle at 20% 20%, rgba(249, 115, 22, 0.14) 0, transparent 28%),radial-gradient(circle at 80% 0%, rgba(34, 211, 238, 0.14) 0, transparent 26%),linear-gradient(135deg, #0a0f1f 0%, #070b16 100%);display:flex;align-items:center;justify-content:center;height:100vh;font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#e2e8f0;">
        <div style="text-align:center;">
          <h1 style="font-size:48px;margin:0;">⚡</h1>
        <p style="font-size:24px;margin:20px 0 0 0;">Spinning up Forge...</p>
        </div>
      </body>
    </html>
  `);

  try {
    // Start the server
    await startServer();

    // Point to Forge server
    await win.loadURL(`http://localhost:${forgePort}`);

    // Open external links in default browser
    win.webContents.setWindowOpenHandler(({ url }) => {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    });

    // Intercept navigation to external URLs
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(`http://localhost:${forgePort}`)) {
        event.preventDefault();
        require('electron').shell.openExternal(url);
      }
    });

    // Open devtools in dev mode (uncomment to enable)
    // if (!app.isPackaged) {
    //   win.webContents.openDevTools({ mode: "detach" });
    // }
  } catch (err) {
    console.error("❌ Failed to start:", err);
    win.loadURL(`data:text/html,
      <html>
        <body style="margin:0;background:radial-gradient(circle at 20% 20%, rgba(249, 115, 22, 0.14) 0, transparent 28%),radial-gradient(circle at 80% 0%, rgba(34, 211, 238, 0.14) 0, transparent 26%),linear-gradient(135deg, #0a0f1f 0%, #070b16 100%);display:flex;align-items:center;justify-content:center;height:100vh;font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#e2e8f0;">
          <div style="text-align:center;">
            <h1 style="font-size:48px;margin:0;">❌</h1>
            <p style="font-size:24px;margin:20px 0 0 0;">Failed to start server</p>
            <p style="font-size:14px;opacity:0.8;margin:10px 0 0 0;">${err.message}</p>
          </div>
        </body>
      </html>
    `);
  }
}

// IPC handlers for window controls
ipcMain.handle("window:minimize", () => {
  if (win) win.minimize();
});

ipcMain.handle("window:close", () => {
  if (win) win.close();
});

ipcMain.handle("window:maximize", () => {
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.handle("window:openDevTools", () => {
  if (win) win.webContents.openDevTools({ mode: "detach" });
});

app.whenReady().then(async () => {
  console.log(`🚀 Forge icon loaded (empty=${forgeIcon.isEmpty()}, size=${forgeIcon.isEmpty() ? '0x0' : forgeIcon.getSize().width + 'x' + forgeIcon.getSize().height})`);
  await createWindow();
});

app.on("window-all-closed", () => {
  // Kill the server process when closing
  if (serverProcess) {
    console.log("🛑 Stopping Forge server...");
    serverProcess.kill();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  // Kill the server process on quit
  if (serverProcess) {
    console.log("🛑 Stopping Forge server...");
    serverProcess.kill();
  }
});
