#!/bin/bash

# View Forge logs from Console.app

echo "📋 Viewing Forge logs..."
echo ""
echo "Opening Console.app filtered for Forge..."
echo ""

# Open Console.app and filter for our app
osascript <<EOF
tell application "Console"
    activate
end tell
EOF

echo "In Console.app:"
echo "  1. Click 'Start' streaming in the toolbar"
echo "  2. In the search box, type: Forge"
echo "  3. Or search for: process:Electron"
echo ""
echo "You should see all console.log() output from the app including:"
echo "  - Server startup messages"
echo "  - Path debugging info"
echo "  - Server logs"
echo "  - Error messages"
echo ""
echo "Alternative: View logs in Terminal"
echo "  log stream --predicate 'process == \"Electron\"' --level debug"
