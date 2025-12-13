import os
import re

path = r"d:\AntigravityProjects\forward_peg_system\earnings-worker\src\dashboard_html.ts"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# We want to replace loadDashboardData function entirely.
# It starts with "async function loadDashboardData() {"
# It ends before "// --- GROUP MANAGEMENT ---"

start_str = "async function loadDashboardData() {"
end_str = "// --- GROUP MANAGEMENT ---"

p1 = content.find(start_str)
p2 = content.find(end_str)

if p1 == -1 or p2 == -1:
    print("Function block not found")
    exit(1)

# Preserve content before and after
prefix = content[:p1]
suffix = content[p2:]

# New Function Body (Correct Logic, Clean Syntax)
new_function = """async function loadDashboardData() {
            const loading = document.getElementById('loading');
            loading.style.display = 'flex';
            document.getElementById('loadingText').textContent = 'Loading Market Data...';
            
            try {
                let url = '/api/dashboard-data';
                if (currentGroup && currentGroup.id) {
                    url += `?groupId=${currentGroup.id}`;
                }
                
                const res = await fetch(url);
                const data = await res.json();
                dashboardData = data;
                executeSort(currentSort.key);
            } catch (e) {
                console.error(e);
            } finally {
                loading.style.display = 'none';
            }
        }
        
        """

raw_new_content = prefix + new_function + suffix

# Fix Escaping Logic and Regex replacements
start_marker = "<script>"
end_marker = "</script>"
m1 = raw_new_content.find(start_marker)
m2 = raw_new_content.find(end_marker)

if m1 == -1 or m2 == -1:
    print("Script markers not found")
    exit(1)

script_body = raw_new_content[m1+len(start_marker):m2]

# Regex replacements for URL spaces
script_body = re.sub(r'/\s*api\s*/', '/api/', script_body)
script_body = re.sub(r'/\s*groups\s*/', '/groups/', script_body)
script_body = re.sub(r'/groups/\s+', '/groups/', script_body)
script_body = re.sub(r'/\s*members\s*', '/members', script_body)
script_body = re.sub(r'\?\s*groupId\s*=', '?groupId=', script_body)
script_body = re.sub(r'\$\{\s*', '${', script_body)
script_body = re.sub(r'\s*\}', '}', script_body)


# ESCAPING LOOP
new_script = []
i = 0
while i < len(script_body):
    char = script_body[i]
    if char == '`':
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
final_content = raw_new_content[:m1+len(start_marker)] + fixed_script + raw_new_content[m2:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(final_content)

print("Rewrote loadDashboardData and fixed escaping.")
