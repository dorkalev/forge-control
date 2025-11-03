#!/bin/bash

# Change to the soc2-downloads directory relative to script location or use current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/soc2-downloads" 2>/dev/null || cd ./soc2-downloads 2>/dev/null || {
  echo "Error: soc2-downloads directory not found"
  exit 1
}

echo "📄 Renaming policy documents based on internal titles..."
echo ""

for file in A-*-policy-doc-*.docx; do
    if [[ ! -f "$file" ]]; then
        continue
    fi

    # Extract ticket ID (e.g., A-195)
    ticket_id=$(echo "$file" | grep -oE '^A-[0-9]+')

    # Extract first text content (title) from the DOCX
    title=$(unzip -q -c "$file" word/document.xml 2>/dev/null | \
            grep -o '<w:t[^>]*>[^<]*</w:t>' | \
            head -1 | \
            sed 's/<[^>]*>//g' | \
            sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    if [[ -z "$title" ]]; then
        echo "⚠️  Could not extract title from $file"
        continue
    fi

    # Sanitize title for filename (remove special characters, limit length)
    safe_title=$(echo "$title" | \
                 sed 's/[^a-zA-Z0-9 ()-]//g' | \
                 sed 's/  */ /g' | \
                 cut -c1-80 | \
                 sed 's/ /_/g')

    # Create new filename
    new_filename="${ticket_id}_${safe_title}.docx"

    # Rename if different
    if [[ "$file" != "$new_filename" ]]; then
        mv "$file" "$new_filename"
        echo "✅ [$ticket_id] $title"
        echo "   → $new_filename"
        echo ""
    else
        echo "⏭️  [$ticket_id] Already named correctly"
    fi
done

echo ""
echo "✅ Done! Listing renamed files:"
echo ""
ls -1 A-*.docx | head -20
