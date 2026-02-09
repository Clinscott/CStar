# [ALFRED] The Odin Protocol Launcher
# This script opens the Odin Protocol in a new dedicated terminal window.

$ProjectRoot = Get-Location
$ScriptPath = Join-Path $ProjectRoot "src/games/odin_protocol/main.py"
$PythonPath = Join-Path $ProjectRoot ".venv/Scripts/python.exe"

# If .venv doesn't exist, try global python
if (-not (Test-Path $PythonPath)) {
    $PythonPath = "python"
}

Write-Host "Initializing the Odin Protocol..." -ForegroundColor Red
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot'; & '$PythonPath' '$ScriptPath'"
