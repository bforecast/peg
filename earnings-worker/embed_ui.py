#!/usr/bin/env python3
"""
Embed ui.html into index.ts as UI_HTML constant
Properly escape template literals for embedding
"""

import re

# Read the UI HTML
with open('src/ui.html', 'r', encoding='utf-8') as f:
    ui_html = f.read()

# Read index.ts
with open('src/index.ts', 'r', encoding='utf-8') as f:
    index_content = f.read()

# Properly escape for embedding in a template literal
# Replace ${  with \${  (escape template literal expressions)
# Replace `  with \`  (escape backticks)
ui_html_escaped = ui_html.replace('\\', '\\\\')  # Escape backslashes first
ui_html_escaped = ui_html_escaped.replace('`', '\\`')  # Escape backticks
ui_html_escaped = ui_html_escaped.replace('${', '\\${')  # Escape template expressions

# Find and replace the UI_HTML constant
pattern = r'const UI_HTML = `[\s\S]*?`;'

replacement = f'const UI_HTML = `{ui_html_escaped}`;'

# Check if pattern exists
if re.search(pattern, index_content):
    new_content = re.sub(pattern, replacement, index_content)
    print("✅ Found and replaced UI_HTML constant")
else:
    # If not found, add it before the export default
    export_pattern = r'(export default \{)'
    new_content = re.sub(export_pattern, f'{replacement}\n\n\\1', index_content)
    print("✅ Added UI_HTML constant before export")

# Write back
with open('src/index.ts', 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(new_content)

print("✅ Successfully embedded UI HTML into index.ts")
print(f"   UI HTML size: {len(ui_html)} bytes")
print(f"   New index.ts size: {len(new_content)} bytes")
