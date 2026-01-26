#!/bin/bash
# Docs Link Checker
# Validates all internal markdown links in docs/
# Usage: ./scripts/check-docs-links.sh
# Exit code: 0 = all links valid, 1 = broken links found

set -e

DOCS_DIR="docs"
ERRORS=0

echo "🔍 Checking documentation links..."
echo ""

# Find all markdown files
while IFS= read -r -d '' file; do
    # Extract relative links from markdown [text](path.md)
    while IFS= read -r link; do
        # Skip empty lines and external links
        [[ -z "$link" ]] && continue
        [[ "$link" =~ ^http ]] && continue
        [[ "$link" =~ ^# ]] && continue

        # Get directory of current file
        dir=$(dirname "$file")

        # Resolve the link path
        target="$dir/$link"
        # Remove anchor fragments
        target="${target%%#*}"

        # Check if file or directory exists
        if [[ ! -f "$target" && ! -d "$target" ]]; then
            echo "❌ BROKEN: $file"
            echo "   Link: $link"
            echo "   Expected: $target"
            echo ""
            ((ERRORS++))
        fi
    done < <(grep -oP '\]\(\K[^)]+(?=\))' "$file" 2>/dev/null || true)
done < <(find "$DOCS_DIR" -name "*.md" -print0)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $ERRORS -eq 0 ]]; then
    echo "✅ All documentation links are valid!"
    exit 0
else
    echo "❌ Found $ERRORS broken link(s)"
    echo ""
    echo "Fix broken links before committing."
    exit 1
fi
