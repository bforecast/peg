$ErrorActionPreference = "Stop"

# Configuration
$ProjectDir = "d:\AntigravityProjects\forward_peg_system\earnings-worker"
$BackupDir = "$ProjectDir\backups"
$DbName = "earnings-db"

# Ensure Backup Directory Exists
if (-not (Test-Path -Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
    Write-Host "Created backup directory: $BackupDir"
}

# Generate Timestamped Filename
$DateStr = Get-Date -Format "yyyy-MM-dd_HH-mm"
$OutputFile = "$BackupDir\backup_$DateStr.sql"

# Change to Project Directory (Wrangler needs context)
Set-Location -Path $ProjectDir

Write-Host "Starting backup of $DbName to $OutputFile..."

# Execute Wrangler Export with Retry
$MaxRetries = 3
$RetryCount = 0
$Success = $false

do {
    Write-Host "Export Attempt $($RetryCount + 1) of $MaxRetries..."
    
    # Run command
    cmd /c npx wrangler d1 export $DbName --remote --output="$OutputFile"
    
    if ($LASTEXITCODE -eq 0) {
        $Success = $true
        Write-Host "Backup Success: $OutputFile"
    }
    else {
        $RetryCount++
        if ($RetryCount -lt $MaxRetries) {
            Write-Warning "Attempt $RetryCount failed. Retrying in 5 seconds..."
            Start-Sleep -Seconds 5
        }
    }
} until ($Success -or $RetryCount -ge $MaxRetries)

if (-not $Success) {
    Write-Error "Backup Failed after $MaxRetries attempts."
    exit 1
}
