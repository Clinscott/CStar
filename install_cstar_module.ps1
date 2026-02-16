# install_cstar_module.ps1
# Installer for the CorvusStar Vanguard Module
# Hooks CorvusStar.psm1 into the user's $PROFILE

param (
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "Starting Corvus Star Vanguard Installation..." -ForegroundColor Cyan

# 1. Define Module Path
$moduleName = "CorvusStar"
# Find the first path in PSModulePath that looks like a user path (Documents)
$validPaths = $env:PSModulePath -split ';'
$userModulePath = $null

foreach ($path in $validPaths) {
    if ($path -like "*Documents*PowerShell*Modules*") {
        $userModulePath = Join-Path $path $moduleName
        break
    }
}

# Fallback if specific Documents path not found (rare)
if (-not $userModulePath) {
    $userModulePath = [System.IO.Path]::Combine([System.Environment]::GetFolderPath("MyDocuments"), "PowerShell", "Modules", $moduleName)
}

Write-Host "Target Module Path: $userModulePath" -ForegroundColor Gray

# 2. Create Directory and Copy Files
if (-not (Test-Path $userModulePath)) {
    New-Item -Path $userModulePath -ItemType Directory -Force | Out-Null
}

$sourceParams = @{
    Path        = "src\cstar\CorvusStar.psm1"
    Destination = Join-Path $userModulePath "CorvusStar.psm1"
    Force       = $true
}

if (Test-Path "src\cstar\CorvusStar.psm1") {
    Copy-Item @sourceParams
    Write-Host "Module copied successfully." -ForegroundColor Green
}
else {
    Write-Error "Source module 'src\cstar\CorvusStar.psm1' not found in current directory."
    exit 1
}

# 3. Hook into $PROFILE
$profilePath = $PROFILE.CurrentUserAllHosts
if (-not (Test-Path $profilePath)) {
    # Create profile if it doesn't exist
    New-Item -Path $profilePath -ItemType File -Force | Out-Null
}

$importCmd = "Import-Module CorvusStar"

# Check if already imported
$profileContent = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
if ($profileContent -notmatch "Import-Module\s+CorvusStar") {
    Add-Content -Path $profilePath -Value "`n# Corvus Star Vanguard`n$importCmd`n"
    Write-Host "Hooked into `$PROFILE." -ForegroundColor Green
}
else {
    Write-Host "Already hooked into `$PROFILE." -ForegroundColor Yellow
}

# 4. Set Execution Policy (Scope: CurrentUser)
# We only need to ensure the user can run scripts. RemoteSigned is usually safe enough.
$currentPolicy = Get-ExecutionPolicy -Scope CurrentUser
if ($currentPolicy -eq "Restricted" -or $currentPolicy -eq "Undefined") {
    Write-Host "Updating ExecutionPolicy to RemoteSigned (scope: CurrentUser)..." -ForegroundColor Yellow
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
}

Write-Host "Installation Complete! Please restart your terminal or run: Import-Module CorvusStar -Force" -ForegroundColor Cyan
