import os

# Paths
base_dir = r"d:/AntigravityProjects/forward_peg_system/earnings-worker/src"
source_file = os.path.join(base_dir, "ui_new.html")
target_file = os.path.join(base_dir, "ui_html.ts")

# Read source
with open(source_file, "r", encoding="utf-8") as f:
    content = f.read()

# FIX: Remove erroneous backslashes in the source HTML/JS
# The source file incorrectly has \` instead of ` and \${ instead of ${
content = content.replace("\\`", "`")
content = content.replace("\\${", "${")

# NOW escape correctly for TypeScript template literal
# Order matters: escape backslashes first!
escaped_content = content.replace("\\", "\\\\")
escaped_content = escaped_content.replace("`", "\\`")
escaped_content = escaped_content.replace("${", "\\${")

# Create TS content
ts_content = f"""// UI HTML exported as a simple string
export const UI_HTML = `{escaped_content}`;
"""

# Write target
with open(target_file, "w", encoding="utf-8") as f:
    f.write(ts_content)

print(f"Fixed and Updated {target_file}")
