# [Ω] CORVUS STAR DISPATCHER
# Force UTF-8 for proper box-drawing characters
chcp 65001 | Out-Null
[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
$ProjectRoot = Get-Location
$env:PYTHONPATH = $ProjectRoot
$Dispatcher = Join-Path $ProjectRoot "src/core/cstar_dispatcher.py"
$PythonPath = Join-Path $ProjectRoot ".venv/Scripts/python.exe"

if (-not (Test-Path $PythonPath)) {
    $PythonPath = "python"
}

# 1. Daemon Health Check (The Heartbeat)
$daemonPort = 50051
$daemonHost = "127.0.0.1"

function Test-DaemonConnection {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $connectTask = $tcp.ConnectAsync($daemonHost, $daemonPort)
        if ($connectTask.Wait(100)) {
            if ($tcp.Connected) {
                $tcp.Close()
                return $true
            }
        }
    }
    catch { }
    return $false
}

if (-not (Test-DaemonConnection)) {
    Write-Host "[C*] Awakening the Daemon..." -ForegroundColor Cyan
    $null = Start-Process "$PythonPath" -ArgumentList "-m src.cstar.core.daemon" -WindowStyle Hidden -WorkingDirectory $ProjectRoot -PassThru
    
    # Wait for up to 5 seconds
    $timeout = 50
    for ($i = 0; $i -lt $timeout; $i++) {
        Start-Sleep -Milliseconds 100
        if (Test-DaemonConnection) {
            Write-Host "[C*] Daemon Online." -ForegroundColor Green
            break
        }
    }
}

& "$PythonPath" "-X" "utf8" "$Dispatcher" $args
