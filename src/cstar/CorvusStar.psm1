# CorvusStar.psm1 - The CNS (Central Nervous System) Interface
# Integrates PowerShell Body with Python Brain (Daemon).

function Invoke-Corvus {
    [CmdletBinding()]
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Args
    )

    # 1. Daemon Health Check (The Heartbeat)
    $daemonPort = 50051
    $daemonHost = "127.0.0.1"
    $daemonRunning = $false

    # Helper function to check connection
    function Test-DaemonConnection {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $connectTask = $tcp.ConnectAsync($daemonHost, $daemonPort)
            if ($connectTask.Wait(100)) {
                # 100ms timeout for check
                if ($tcp.Connected) {
                    $tcp.Close()
                    return $true
                }
            }
        }
        catch { }
        return $false
    }

    if (Test-DaemonConnection) {
        $daemonRunning = $true
    }

    # 2. Auto-Start Daemon if needed
    if (-not $daemonRunning) {
        Write-Host "[C*] Awakening the Daemon..." -ForegroundColor Cyan
        
        # Start in background, hidden
        # Use -PassThru to get process object if needed, but we rely on port check
        $proc = Start-Process python -ArgumentList "-m src.cstar.core.daemon" -WindowStyle Hidden -WorkingDirectory $PWD -PassThru
        
        # Manifesting Wait (Retry Loop)
        # Wait up to 5 seconds for the daemon to bind port
        $timeout = 50 # 50 * 100ms = 5 seconds
        for ($i = 0; $i -lt $timeout; $i++) {
            Start-Sleep -Milliseconds 100
            if (Test-DaemonConnection) {
                $daemonRunning = $true
                Write-Host "[C*] Daemon Online." -ForegroundColor Green
                break
            }
            
            # Check if process died early
            if ($proc.HasExited) {
                Write-Warning "[C*] Daemon process died immediately. Exit Code: $($proc.ExitCode)"
                break
            }
        }

        if (-not $daemonRunning) {
            Write-Warning "[C*] Daemon failed to start or bind port within timeout. Falling back to direct execution."
            # If daemon failed, we can fallback to running client directly?
            # No, client needs daemon. We might need to run the command directly via python -m src.cstar.core.standalone_runner? 
            # For now, let the client fail gracefully with its own error message.
        }
    }

    # 3. Dispatch to Client (The Synapse)
    # We use the python client to talk to the daemon
    python -m src.cstar.core.client @Args
}

# -------------------------------------------------------------------------
# TAB COMPLETION (The Anticipation)
# -------------------------------------------------------------------------
Register-ArgumentCompleter -CommandName "c*", "Invoke-Corvus" -ScriptBlock {
    param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)

    if (-not ((Test-Path ".agent/skills") -or (Test-Path ".agent/workflows"))) {
        return 
    }

    $candidates = @()
    $dirs = @(".agent/workflows", ".agent/skills")
    
    foreach ($dir in $dirs) {
        if (Test-Path $dir) {
            $files = Get-ChildItem -Path $dir -Include "*.qmd", "*.md" -Recurse
            foreach ($file in $files) {
                # Performance: Read Top 20 lines
                $content = Get-Content $file.FullName -TotalCount 20
                $cmdName = $file.BaseName 
                $desc = ""
                
                foreach ($line in $content) {
                    if ($line -match "^name:\s*['""]?([\w-]+)['""]?") {
                        $cmdName = $Matches[1]
                    }
                    if ($line -match "^description:\s*['""]?(.*?)['""]?$") {
                        $desc = $Matches[1]
                    }
                }

                if ($cmdName.StartsWith($wordToComplete)) {
                    $candidates += [System.Management.Automation.CompletionResult]::new(
                        $cmdName, 
                        $cmdName, 
                        [System.Management.Automation.CompletionResultType]::ParameterValue, 
                        $desc
                    )
                }
            }
        }
    }
    
    return $candidates
}

# Alias
Set-Alias -Name c* -Value Invoke-Corvus -Scope Global
Export-ModuleMember -Function Invoke-Corvus -Alias c*
