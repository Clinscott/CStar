$ProjectRoot = Get-Location
$Dispatcher = Join-Path $ProjectRoot "src/core/cstar_dispatcher.py"
$PythonPath = Join-Path $ProjectRoot ".venv/Scripts/python.exe"

if (-not (Test-Path $PythonPath)) {
    $PythonPath = "python"
}

& "$PythonPath" "$Dispatcher" $args
