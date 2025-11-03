# Electron Desktop App for Local Agent

This wraps the local-agent server in a frameless Electron window.

## Usage

```bash
# Start both the local-agent server and Electron app
npm run app
```

This will:
1. Start the local-agent server on port 4665
2. Wait for it to be ready
3. Open an Electron window pointing to http://localhost:4665

## Features

- **Frameless window** with custom titlebar
- **Draggable titlebar** (entire top bar)
- **Window controls** (minimize, maximize, close)
- **DevTools** open automatically in dev mode
- **No code signing required** - runs from source

## Manual Commands

```bash
# Run just the server
npm run local-agent

# Run just the Electron window (server must already be running)
npm run dev:electron
```

## Files

- `electron/main.cjs` - Electron main process (window creation, IPC)
- `electron/preload.cjs` - Preload script (exposes window controls to UI)
- The UI at `http://localhost:4665` includes custom window controls

## Security

- `contextIsolation: true` - Renderer process is isolated
- `nodeIntegration: false` - No direct Node.js access from UI
- `preload.cjs` - Only specific APIs (window controls) exposed via contextBridge
