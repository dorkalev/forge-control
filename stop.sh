#!/bin/bash
# Kill any running forge-control Electron instances
# Use nohup to detach the kill command so it doesn't die with parent
nohup bash -c 'sleep 0.5; pkill -f "forge-control.*Electron"' >/dev/null 2>&1 &
echo "Stopping forge-control instances..."
