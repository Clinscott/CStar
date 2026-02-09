# [Ω] CORVUS STAR DISPATCHER
# Force UTF-8 for proper box-drawing characters
chcp 65001 | Out-Null
[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

$ProjectRoot = Get-Location
$Dispatcher = Join-Path $ProjectRoot "src/core/cstar_dispatcher.py"
$PythonPath = Join-Path $ProjectRoot ".venv/Scripts/python.exe"

if (-not (Test-Path $PythonPath)) {
    $PythonPath = "python"
}

& "$PythonPath" "-X" "utf8" "$Dispatcher" $args
