#!/bin/bash

# Build Local Agent Electron App

echo "🚀 Building Local Agent..."
echo ""

# Clean previous builds
if [ -d "dist" ]; then
  echo "🧹 Cleaning previous build..."
  rm -rf dist
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Build the app
echo "🔨 Building application..."
npm run build:prod 2>&1 | grep -v "unable to execute hdiutil" | grep -v "Exit code: 1. Command failed: hdiutil" || true

# Check if .app was created (ignore DMG errors)
if [ -d "dist/mac-arm64/Local Agent.app" ] || [ -d "dist/mac/Local Agent.app" ]; then
  echo ""
  echo "✅ Build complete!"
  echo ""
  echo "📂 Output directory: dist/"
  echo ""

  # List the built artifacts
  if [ -d "dist" ]; then
    echo "Built files:"
    ls -lh dist/
    echo ""
  fi

  # Find the .app file
  APP_PATH=$(find dist -name "*.app" -type d | head -n 1)
  if [ -n "$APP_PATH" ]; then
    echo "🎯 Application: $APP_PATH"
    echo ""
    echo "To install:"
    echo "  cp -r \"$APP_PATH\" /Applications/"
    echo ""
    echo "To run:"
    echo "  open \"$APP_PATH\""
    echo ""
  fi

  # Find the .zip file
  ZIP_PATH=$(find dist -name "*.zip" | head -n 1)
  if [ -n "$ZIP_PATH" ]; then
    echo "📦 Archive: $ZIP_PATH"
    echo ""
    echo "To distribute:"
    echo "  Share this zip file - recipients can unzip and drag to Applications"
    echo ""
  fi
else
  echo ""
  echo "❌ Build failed!"
  exit 1
fi
