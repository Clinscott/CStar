function Invoke-CStarAgentLoop {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [string]$TargetFile,

        [Parameter(Mandatory = $true)]
        [string]$LedgerDirectory,

        [Parameter(Mandatory = $true)]
        [string]$TaskDescription
    )

    try {
        # 1. Extract Directives
        Write-Host "ALFRED: 'Consulting the Archives for historical precedents...'" -ForegroundColor Cyan
        $Directives = Get-CortexDirectives -LedgerDirectory $LedgerDirectory
        
        # 2. Read Target Code
        if (-not (Test-Path $TargetFile)) {
            throw "Target file not found: $TargetFile"
        }
        $RawCode = Get-Content -Path $TargetFile -Raw -Encoding UTF8

        # 3. Construct Master Prompt
        $MasterPrompt = @"
$Directives

TASK:
$TaskDescription

TARGET CODE ($TargetFile):
$RawCode
"@
        
        # 4. Simulate Agent Call
        Write-Host "ALFRED: 'Transmitting constraints to the Engine...'" -ForegroundColor Cyan
        
        # TODO: Execute Antigravity/Gemini CLI here and capture output into $AgentOutput
        # for now, we simulate a "refactor" by just adding a comment
        $AgentOutput = $RawCode + "`n# Refactored by CStar Agent on $(Get-Date)"

        # 5. Save Candidate
        $CandidateFile = "{0}_candidate{1}" -f [System.IO.Path]::GetFileNameWithoutExtension($TargetFile), [System.IO.Path]::GetExtension($TargetFile)
        $CandidatePath = Join-Path -Path $LedgerDirectory -ChildPath $CandidateFile
        $AgentOutput | Set-Content -Path $CandidatePath -Encoding UTF8
        Write-Host "ALFRED: 'Candidate forged at $CandidatePath.'" -ForegroundColor Cyan

        # 6. Invoke Gungnir Strike
        Write-Host "ALFRED: 'Summoning the Raven for judgment...'" -ForegroundColor Cyan
        
        # Locate Gungnir components relative to this script or generic path?
        # Assuming Invoke-RavensGungnirStrike is loaded or in the same dir
        $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
        $GungnirStrike = Join-Path -Path $ScriptDir -ChildPath "Invoke-RavensGungnirStrike.ps1"
        if (Test-Path $GungnirStrike) {
            . $GungnirStrike
            Invoke-RavensGungnirStrike -CandidateFilePath $CandidatePath -MemoryFilePath (Join-Path $LedgerDirectory "ledger.json") -AlignmentRules @{}
        }
        else {
            Write-Warning "Invoke-RavensGungnirStrike not found at $GungnirStrike. Skipping validation."
        }

        # 7. Output Completion
        Write-Host "ALFRED: 'Cycle complete. The stars await your next command, Sir.'" -ForegroundColor Green
    }
    catch {
        Write-Error "ALFRED: 'Critical failure in the flight loop: $_'"
    }
}
