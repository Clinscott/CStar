function Get-CortexDirectives {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [string]$LedgerDirectory
    )

    $DirectivesFile = Join-Path -Path $LedgerDirectory -ChildPath "cortex_directives.md"

    if (Test-Path $DirectivesFile) {
        $RawContent = Get-Content -Path $DirectivesFile -Raw -Encoding UTF8
        return @"
********************************************************************************
MUNINN'S WHISPERS (HISTORICAL CONTEXT)
********************************************************************************
$RawContent
********************************************************************************
"@
    }
    else {
        return "No historical directives available. Adhere strictly to the baseline Linscott Standard."
    }
}
