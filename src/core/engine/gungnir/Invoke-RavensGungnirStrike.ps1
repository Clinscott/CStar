function Invoke-RavensGungnirStrike {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [string]$CandidateFilePath,

        [Parameter(Mandatory = $true)]
        [string]$MemoryFilePath,

        [hashtable]$AlignmentRules = @{ CortexThreshold = 85 }
    )

    $fullPath = Resolve-Path $CandidateFilePath
    $Observations = @()

    # 1. Assess Cortex Alignment (AST Parsing / Regex)
    # Heuristic: Check for docstrings, proper function headers, and complexity
    $Score = 100
    $content = Get-Content $fullPath -Raw
    
    # Simple heuristic: penalty if missing docstring keyword "Summary" or "Description" in comment block
    if ($content -notmatch "Summary" -and $content -notmatch "Description") { $Score -= 10 }
    
    # Check for too many lines in a single function (hypothetical AST check)
    $ast = [System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$null, [ref]$null)
    $functions = $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
    foreach ($func in $functions) {
        $lines = $func.Extent.EndLineNumber - $func.Extent.StartLineNumber
        if ($lines -gt 50) { $Score -= 10 }
    }

    if ($Score -lt $AlignmentRules.CortexThreshold) {
        $Observations += 1
    }
    else {
        $Observations += 0
    }

    # 2. Run Invoke-ScriptAnalyzer
    $analyzerResults = Invoke-ScriptAnalyzer -Path $fullPath -Severity Error -ErrorAction SilentlyContinue
    if ($analyzerResults.Count -gt 0) {
        $Observations += 1
    }
    else {
        $Observations += 0
    }

    # 3. Run Invoke-Pester
    $testPath = "$($fullPath.Substring(0, $fullPath.LastIndexOf('.'))).Tests.ps1"
    if (Test-Path $testPath) {
        try {
            # Use -Passthru to get results
            $pesterResults = Invoke-Pester -Path $testPath -Output None -Passthru
            if ($pesterResults.FailedCount -gt 0) {
                $Observations += 1
            }
            else {
                $Observations += 0
            }
        }
        catch {
            $Observations += 1
        }
    }
    else {
        # If no tests, we might consider it a fail or just a pass logic skip
        # Requirement says "Clean = 0", so we'll assume pass if no tests exist or maybe it's out of scope
        $Observations += 0
    }

    # 4. Invoke SPRT Engine
    $sprtFile = "$PSScriptRoot\Invoke-GungnirSPRT.ps1"
    if (Test-Path $sprtFile) { . $sprtFile }
    $sprtResult = Invoke-GungnirSPRT -Observations $Observations

    # 5. Evaluate Decision
    $decision = $sprtResult.Decision
    $finalLLR = $sprtResult.FinalLLR
    $obsString = $Observations -join ","

    if ($decision -eq "Accept") {
        # Execute muninn.py
        $pythonScript = "$PSScriptRoot\muninn.py"
        python $pythonScript --ledger $MemoryFilePath --target $CandidateFilePath --decision "Accept" --score $Score --llr $finalLLR --obs $Observations
    }
    elseif ($decision -eq "Reject") {
        Remove-Item $fullPath -Force
        Write-Warning "Candidate $CandidateFilePath rejected by Gungnir and purged."
    }
    else {
        Write-Host "Inconclusive results. Decision: Continue. LLR: $finalLLR" -ForegroundColor Cyan
    }

    return $sprtResult
}
