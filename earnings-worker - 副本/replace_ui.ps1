# PowerShell script to replace UI_HTML in index.ts

$indexPath = "src\index.ts"
$uiPath = "src\ui_new.html"

# Read files
$indexContent = Get-Content $indexPath -Raw
$uiContent = Get-Content $uiPath -Raw

# Escape backticks and dollar signs for template literal
$uiEscaped = $uiContent -replace '`', '\`' -replace '\$', '\$'

# Find and replace the UI_HTML constant
$pattern = '(?s)const UI_HTML = `.*?`;'
$replacement = "const UI_HTML = ``$uiEscaped``;"

$newContent = $indexContent -replace $pattern, $replacement

# Write back
Set-Content $indexPath $newContent -NoNewline

Write-Host "UI replaced successfully!"
