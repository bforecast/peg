import os

# Paths
base_dir = r"d:/AntigravityProjects/forward_peg_system/earnings-worker/src"
source_file = os.path.join(base_dir, "ui_new.html")
target_file = os.path.join(base_dir, "ui_html.ts")

# 1. READ AND CLEAN SOURCE
print(f"Reading {source_file}...")
with open(source_file, "r", encoding="utf-8") as f:
    content = f.read()

# Remove erroneous escapes to make it valid HTML/JS
# e.g. change \` to ` and \${ to ${
cleaned_content = content.replace("\\`", "`").replace("\\${", "${")

# Save cleaned source back to ui_new.html so it is correct on disk
with open(source_file, "w", encoding="utf-8") as f:
    f.write(cleaned_content)
print(f"Sanitized {source_file}")

# 2. GENERATE TYPESCRIPT EXPORT
# Now escape validly for TS template literal
# Escape backslashes first, then backticks, then ${
escaped_content = cleaned_content.replace("\\", "\\\\")
escaped_content = escaped_content.replace("`", "\\`")
escaped_content = escaped_content.replace("${", "\\${")

ts_content = f"""// UI HTML exported as a simple string
export const UI_HTML = `{escaped_content}`;
"""

with open(target_file, "w", encoding="utf-8") as f:
    f.write(ts_content)

print(f"Regenerated {target_file}")
