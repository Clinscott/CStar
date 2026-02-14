# GungnirSPRT.Tests.ps1
# Feature: Sequential Probability Ratio Test (SPRT)
# Lore: "The Gungnir Calculus"

$ScriptPath = $PSScriptRoot
if (-not $ScriptPath) {
    $ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
}

if (-not $ScriptPath) {
    $ScriptPath = Get-Location
}

. "$ScriptPath\Invoke-GungnirSPRT.ps1"

Describe "The Gungnir Calculus (SPRT Math Engine)" {
    
    Context "Acceptance (Baseline Hypothesis)" {
        It "Given an observation array of [0,0,0,0,0,0,0,0,0,0], When the SPRT is invoked, Then the Decision must be 'Accept'" {
            $Observations = @(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
            $Result = Invoke-GungnirSPRT -Observations $Observations
            $Result.Decision | Should Be "Accept"
        }
    }

    Context "Rejection (Flaky/Alternative Hypothesis)" {
        It "Given an observation array of [1,1,0,1,1], When the SPRT is invoked, Then the Decision must be 'Reject'" {
            $Observations = @(1, 1, 0, 1, 1)
            $Result = Invoke-GungnirSPRT -Observations $Observations
            $Result.Decision | Should Be "Reject"
        }
    }

    Context "Inconclusive (Continue Evaluation)" {
        It "Given an observation array of [0,1,0], When the SPRT is invoked, Then the Decision must be 'Continue'" {
            $Observations = @(0, 1, 0)
            $Result = Invoke-GungnirSPRT -Observations $Observations
            $Result.Decision | Should Be "Continue"
        }
    }
}
