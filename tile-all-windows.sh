#!/bin/bash

# Tile all work windows (iTerm2, SDLC, Linear, Slack, Warp, Chrome)
# Brings work windows to foreground and sends all others to background
# Usage: ./tile-all-windows.sh

osascript <<'EOF'
-- Get primary screen dimensions
tell application "Finder"
    set screenBounds to bounds of window of desktop
    set screenWidth to item 3 of screenBounds
    set screenHeight to item 4 of screenBounds
end tell

-- Account for menu bar
set menuBarHeight to 38
set usableWidth to screenWidth
set usableHeight to screenHeight - menuBarHeight

-- Define work apps
set workApps to {"iTerm2", "Electron", "Google Chrome", "Linear", "Slack", "Warp"}

-- Hide all non-work apps
tell application "System Events"
    set allProcesses to every process whose visible is true
    repeat with proc in allProcesses
        set procName to name of proc
        if procName is not in workApps and procName is not "Finder" then
            set visible of proc to false
        end if
    end repeat
end tell

-- Collect all windows from work apps
set allWindows to {}

-- Get iTerm2 windows
tell application "System Events"
    if exists (process "iTerm2") then
        tell process "iTerm2"
            repeat with w in windows
                set end of allWindows to {appName:"iTerm2", windowRef:w}
            end repeat
        end tell
    end if
end tell

-- Get SDLC window (either Electron or browser)
tell application "System Events"
    -- Try Electron app first
    if exists (process "Electron") then
        tell process "Electron"
            if (count of windows) > 0 then
                set w to window 1
                set end of allWindows to {appName:"Electron", windowRef:w}
            end if
        end tell
    end if
end tell

-- Get all Chrome windows
tell application "System Events"
    if exists (process "Google Chrome") then
        tell process "Google Chrome"
            repeat with w in windows
                set end of allWindows to {appName:"Google Chrome", windowRef:w}
            end repeat
        end tell
    end if
end tell

-- Get Linear
tell application "System Events"
    if exists (process "Linear") then
        tell process "Linear"
            if (count of windows) > 0 then
                set w to window 1
                set end of allWindows to {appName:"Linear", windowRef:w}
            end if
        end tell
    end if
end tell

-- Get Slack
tell application "System Events"
    if exists (process "Slack") then
        tell process "Slack"
            if (count of windows) > 0 then
                set w to window 1
                set end of allWindows to {appName:"Slack", windowRef:w}
            end if
        end tell
    end if
end tell

-- Get Warp
tell application "System Events"
    if exists (process "Warp") then
        tell process "Warp"
            if (count of windows) > 0 then
                set w to window 1
                set end of allWindows to {appName:"Warp", windowRef:w}
            end if
        end tell
    end if
end tell

set windowCount to count of allWindows

if windowCount is 0 then
    display notification "No work windows found" with title "Tile All Windows"
    return
end if

-- Smart layout calculation
set numColumns to 0
set numRows to 0

if windowCount is 1 then
    set numColumns to 1
    set numRows to 1
else if windowCount is 2 then
    set numColumns to 2
    set numRows to 1
else if windowCount is 3 then
    set numColumns to 3
    set numRows to 1
else if windowCount is 4 then
    set numColumns to 2
    set numRows to 2
else if windowCount is 5 then
    set numColumns to 3
    set numRows to 2
else if windowCount is 6 then
    set numColumns to 3
    set numRows to 2
else if windowCount is 7 or windowCount is 8 then
    set numColumns to 4
    set numRows to 2
else if windowCount is 9 then
    set numColumns to 3
    set numRows to 3
else
    -- Calculate square-ish grid
    set sqrtCount to (windowCount ^ 0.5) as integer
    set numColumns to sqrtCount + 1
    set numRows to ((windowCount + numColumns - 1) div numColumns)
end if

-- Calculate window dimensions
set windowWidth to (usableWidth / numColumns) as integer
set windowHeight to (usableHeight / numRows) as integer

-- Bring all work apps to foreground and position windows
repeat with i from 1 to windowCount
    set currentItem to item i of allWindows
    set appName to appName of currentItem
    set windowRef to windowRef of currentItem

    -- Bring app to foreground
    tell application "System Events"
        set visible of process appName to true
        set frontmost of process appName to true
    end tell

    -- Calculate grid position (0-indexed)
    set colIndex to (i - 1) mod numColumns
    set rowIndex to (i - 1) div numColumns

    -- Calculate window position
    set xPos to colIndex * windowWidth
    set yPos to menuBarHeight + (rowIndex * windowHeight)

    -- Set window bounds
    tell application "System Events"
        tell process appName
            tell windowRef
                set position to {xPos, yPos}
                set size to {windowWidth, windowHeight}
            end tell
        end tell
    end tell
end repeat

display notification (windowCount & " work windows tiled (" & numColumns & "x" & numRows & " grid)") with title "Tile All Windows"
EOF
