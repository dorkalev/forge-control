#!/bin/bash
# Kill any running forge-control Electron instances and start new one
# Only kill Electron processes, not bash/node
for pid in $(pgrep -f "Electron.*forge-control" 2>/dev/null); do
  kill -9 "$pid" 2>/dev/null || true
done
sleep 1
./dev
