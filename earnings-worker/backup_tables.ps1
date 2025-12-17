$ErrorActionPreference = "Stop"

# Configuration
$ProjectDir = "d:\AntigravityProjects\forward_peg_system\earnings-worker"
$BackupDir = "$ProjectDir\backups"
$DbName = "earnings-db"

# Ensure Backup Directory Exists
if (-not (Test-Path -Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$DateStr = Get-Date -Format "yyyy-MM-dd_HH-mm"
$Folder = "$BackupDir\backup_$DateStr"
New-Item -ItemType Directory -Path $Folder | Out-Null
Write-Host "Created backup folder: $Folder"

# Tables to Backup
$Tables = @("stock_quotes", "earnings_estimates", "group_members", "portfolios")
$OptionalTables = @("stock_prices")

# Function to Backup Table
function Backup-Table ($TableName) {
    Write-Host "Backing up table: $TableName ..."
    $OutputFile = "$Folder\$TableName.json"
    
    # Use cmd /c to handle redirection robustly without PowerShell encoding issues
    # Note: --json flag ensures output is pure JSON
    $Cmd = "npx wrangler d1 execute $DbName --remote --command ""SELECT * FROM $TableName"" --json > ""$OutputFile"""
    
    cmd /c $Cmd
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Success: $OutputFile"
    }
    else {
        Write-Warning "  Failed to backup $TableName"
    }
}

# 1. Backup Critical Tables
foreach ($Table in $Tables) {
    Backup-Table $Table
}

# 2. Backup Heavy Tables (Optional)
Write-Host "`nAttempting backup of history (stock_prices)... This may take longer."
Backup-Table "stock_prices"

Write-Host "`nBackup Complete. Files are in $Folder"
