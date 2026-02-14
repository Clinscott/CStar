function Invoke-GungnirSPRT {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [double[]]$Observations,

        [double]$p0 = 0.05,
        [double]$p1 = 0.20,
        [double]$Alpha = 0.05,
        [double]$Beta = 0.20
    )

    # Lower Bound (B) = ln(Beta / (1 - Alpha))
    $B = [math]::Log($Beta / (1 - $Alpha))

    # Upper Bound (A) = ln((1 - Beta) / Alpha)
    $A = [math]::Log((1 - $Beta) / $Alpha)

    $FinalLLR = 0.0
    $SamplesEvaluated = 0

    foreach ($obs in $Observations) {
        $SamplesEvaluated++
        # Log-Likelihood Ratio (LLR) calculation for Bernoulli
        # x = 1 (Fail), 0 (Pass)
        if ($obs -eq 1) {
            $FinalLLR += [math]::Log($p1 / $p0)
        }
        else {
            $FinalLLR += [math]::Log((1 - $p1) / (1 - $p0))
        }
    }

    $Decision = "Continue"
    if ($FinalLLR -ge $A) {
        $Decision = "Reject"
    }
    elseif ($FinalLLR -le $B) {
        $Decision = "Accept"
    }

    return [PSCustomObject]@{
        Decision         = $Decision
        FinalLLR         = $FinalLLR
        SamplesEvaluated = $SamplesEvaluated
    }
}
