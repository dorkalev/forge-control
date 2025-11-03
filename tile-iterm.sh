#!/bin/bash

# Tile all iTerm2 windows in a grid
# Usage: ./tile-iterm.sh [columns]
# Example: ./tile-iterm.sh 3  (for 3 columns)
# If no argument provided, automatically calculates optimal layout

MANUAL_COLUMNS="${1:-}"

osascript <<EOF
tell application "iTerm"
    activate

    -- Get all windows
    set windowList to every window
    set windowCount to count of windowList

    if windowCount is 0 then
        display notification "No iTerm2 windows found" with title "Tile iTerm"
        return
    end if

    -- Get primary screen dimensions
    tell application "Finder"
        set screenBounds to bounds of window of desktop
        set screenWidth to item 3 of screenBounds
        set screenHeight to item 4 of screenBounds
    end tell

    -- Account for menu bar (typically 25-38px) and dock
    set menuBarHeight to 38
    set dockPadding to 0

    set usableWidth to screenWidth - dockPadding
    set usableHeight to screenHeight - menuBarHeight

    -- Smart layout calculation
    set numColumns to 0
    set numRows to 0
    set manualCols to "$MANUAL_COLUMNS"

    -- Check if manual columns specified
    if manualCols is not "" then
        set numColumns to manualCols as integer
        set numRows to ((windowCount + numColumns - 1) div numColumns)
    else if windowCount is 1 then
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
    else if windowCount is 10 then
        set numColumns to 5
        set numRows to 2
    else if windowCount is 12 then
        set numColumns to 4
        set numRows to 3
    else
        -- For larger numbers, calculate square-ish grid favoring horizontal
        set sqrtCount to (windowCount ^ 0.5) as integer
        if windowCount mod 2 is 0 and windowCount > 2 then
            -- Even number > 2: prefer more columns (vertical split)
            set numColumns to sqrtCount + 1
        else
            set numColumns to sqrtCount
        end if
        set numRows to ((windowCount + numColumns - 1) div numColumns)
    end if

    -- Calculate window dimensions
    set windowWidth to (usableWidth / numColumns) as integer
    set windowHeight to (usableHeight / numRows) as integer

    -- Position each window
    repeat with i from 1 to windowCount
        set currentWindow to item i of windowList

        -- Calculate grid position (0-indexed)
        set colIndex to (i - 1) mod numColumns
        set rowIndex to (i - 1) div numColumns

        -- Calculate window position
        set xPos to colIndex * windowWidth
        set yPos to menuBarHeight + (rowIndex * windowHeight)

        -- Set window bounds
        tell currentWindow
            set bounds to {xPos, yPos, xPos + windowWidth, yPos + windowHeight}
        end tell
    end repeat

    display notification (windowCount & " windows tiled (" & numColumns & "x" & numRows & " grid)") with title "Tile iTerm"
end tell
EOF
