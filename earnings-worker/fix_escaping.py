
import os

path = r"d:\AntigravityProjects\forward_peg_system\earnings-worker\src\dashboard_html.ts"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "<script>"
end_marker = "</script>"

p1 = content.find(start_marker)
p2 = content.find(end_marker)

if p1 == -1 or p2 == -1:
    print("Script markers not found")
    exit(1)

# Extract script content (excluding markers)
script_body = content[p1 + len(start_marker):p2]

# ESCAPING LOOP
new_script = []
i = 0
while i < len(script_body):
    char = script_body[i]
    if char == '`':
        # Check if already escaped
        if i > 0 and script_body[i-1] == '\\':
            new_script.append(char)
        else:
            new_script.append('\\`')
    elif char == '$' and i + 1 < len(script_body) and script_body[i+1] == '{':
        if i > 0 and script_body[i-1] == '\\':
             new_script.append(char)
        else:
             new_script.append('\\$')
    else:
        new_script.append(char)
    i += 1

fixed_script = "".join(new_script)
final_content = content[:p1 + len(start_marker)] + fixed_script + content[p2:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(final_content)

print("Fixed escaping in script block.")
