<#
.SYNOPSIS
    Corvus Star Framework Installation Script.
.DESCRIPTION
    Initializes the Corvus Star (C*) environment, deploys core engine scripts, 
    workflows, skills, and documentation templates.
.PARAMETER TargetDir
    The directory where the framework will be installed. Defaults to current location.
.PARAMETER Persona
    The active AI persona (ODIN or ALFRED).
.PARAMETER Silent
    If set, runs installation without interactive prompts.
.PARAMETER NoBackup
    If set, skips the creation of backups in .corvus_quarantine.
.EXAMPLE
    .\install.ps1 -TargetDir "C:\MyProject" -Persona ODIN
#>
param (
    [string]$TargetDir = (Get-Location).Path,
    [ValidateSet("ODIN", "ALFRED", "")]
    [string]$Persona = "",
    [switch]$Silent,
    [switch]$NoBackup
)

# ==============================================================================
# 🧩 CORE UTILITIES
# ==============================================================================

function Write-Log {
    <#
    .SYNOPSIS
        Appends timestamped entry to the installation log.
    #>
    [CmdletBinding()]
    param ([Parameter(Mandatory = $true)][string]$Message, [Parameter(Mandatory = $true)][string]$Path)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $parent = Split-Path $Path -Parent
    if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Add-Content -Path $Path -Value "[$ts] $Message" -ErrorAction SilentlyContinue
}

function Assert-SafePath {
    <#
    .SYNOPSIS
        Verifies path safety and prevents traversal.
    #>
    [CmdletBinding()]
    param ([string]$Path)
    $res = [System.IO.Path]::GetFullPath($Path)
    if ($res -ne $Path -and $Path -match '\.\.') { throw "SECURITY: Path traversal: $Path" }
    return $res
}

function Get-UserChoice {
    <#
    .SYNOPSIS
        Conflict resolution prompt.
    #>
    [CmdletBinding()]
    param ($FilePath)
    Write-Host "`n?? Conflict: $FilePath" -ForegroundColor Yellow
    Write-Host "[S] Skip  [O] Overwrite  [M] Merge  [D] Diff  [Q] Quit" -ForegroundColor White
    return (Read-Host "Action").ToUpper()
}

# ==============================================================================
# 🧬 PERSONA & QUARANTINE
# ==============================================================================

function Invoke-SafeQuarantine {
    <#
    .SYNOPSIS
        Backs up files to .corvus_quarantine.
    #>
    [CmdletBinding()]
    param ($FilePath, $LogPath, $NoBackup)
    if (-not (Test-Path $FilePath) -or $NoBackup) { return $true }
    $qDir = Join-Path (Split-Path $FilePath -Parent) ".corvus_quarantine"
    if (-not (Test-Path $qDir)) { New-Item -ItemType Directory -Path $qDir -Force | Out-Null }
    $qPath = Join-Path $qDir "$((Get-Date -Format 'yyyyMMdd_HHmmss'))_$(Split-Path $FilePath -Leaf)"
    Move-Item $FilePath $qPath -Force
    if ($LogPath) { Write-Log "QUARANTINED: $FilePath" $LogPath }
}

function Resolve-Persona {
    <#
    .SYNOPSIS
        Precedence-based persona resolution.
    #>
    [CmdletBinding()]
    param ($Cli, $Silent, $AgentDir)
    if ($Cli) { return if ($Cli -match "ODIN|GOD") { "ODIN" } else { "ALFRED" } }
    $cfgFile = Join-Path $AgentDir "config.json"
    if (Test-Path $cfgFile) {
        $cfg = Get-Content $cfgFile -Raw | ConvertFrom-Json
        if ($cfg.Persona) { return $cfg.Persona }
    }
    if ($Silent) { return "ALFRED" }
    Write-Host "`n?? Choose Persona:`n [1] ODIN`n [2] ALFRED" -ForegroundColor Cyan
    while ($true) {
        $ch = Read-Host "Select [1/2]"
        if ($ch -eq "1") { return "ODIN" }
        if ($ch -eq "2") { return "ALFRED" }
    }
}

# ==============================================================================
# 📑 SMART MERGE HELPER
# ==============================================================================

function Merge-Json {
    <# .SYNOPSIS JSON Key Merge #>
    [CmdletBinding()]
    param ($Source, $Dest)
    $s = Get-Content $Source -Raw | ConvertFrom-Json
    $d = Get-Content $Dest -Raw | ConvertFrom-Json
    foreach ($p in $s.PSObject.Properties) {
        if (-not $d.PSObject.Properties[$p.Name]) { $d | Add-Member $p.Name $p.Value }
    }
    $d | ConvertTo-Json -Depth 10 | Out-File $Dest -Encoding utf8
}

function Merge-Text {
    <# .SYNOPSIS Unique Line Append #>
    [CmdletBinding()]
    param ($Source, $Dest)
    $dLines = Get-Content $Dest
    $new = Get-Content $Source | Where-Object { $dLines -notcontains $_ }
    if ($new) { ($dLines + "" + "### Corvus Star Additions ###" + $new) | Out-File $Dest -Encoding utf8 }
}

function Invoke-SmartMerge {
    <# .SYNOPSIS Merging Dispatch #>
    [CmdletBinding()]
    param ($Source, $Dest)
    Copy-Item $Dest "$Dest.bak" -Force
    if ([System.IO.Path]::GetExtension($Dest).ToLower() -eq ".json") { Merge-Json $Source $Dest }
    else { Merge-Text $Source $Dest }
}

# ==============================================================================
# 📦 DEPLOYMENT
# ==============================================================================

function Invoke-SmartCopy {
    <# .SYNOPSIS Copy/Conflict Engine #>
    [CmdletBinding()]
    param ($Source, $Dest)
    if (-not (Test-Path $Dest)) { Copy-Item $Source $Dest -Force; return }
    if ((Get-FileHash $Source).Hash -eq (Get-FileHash $Dest).Hash) { return }
    switch (Get-UserChoice $Dest) {
        "O" { Copy-Item $Source $Dest -Force }
        "M" { Invoke-SmartMerge $Source $Dest }
        "Q" { exit }
    }
}

function Invoke-DocumentationTakeover {
    <# .SYNOPSIS Preservation Wrapper #>
    [CmdletBinding()]
    param ($Ex, $Tm, $Ou, $Lg, $Nb)
    $old = if (Test-Path $Ex) { Get-Content $Ex -Raw } else { "" }
    $new = Get-Content $Tm -Raw
    if (-not $old) { Copy-Item $Tm $Ou -Force; return }
    Invoke-SafeQuarantine $Ex $Lg $Nb | Out-Null
    ($new + "`n`n--`n`n## 📜 Project Legacy`n`n$old") | Out-File $Ou -Encoding utf8
}

function Deploy-Workflows {
    <# .SYNOPSIS Template Selection Parity #>
    [CmdletBinding()]
    param ($srcBase, $target, $persona)
    $wfs = @("lets-go.md", "run-task.md", "investigate.md", "wrap-it-up.md", "SovereignFish.md")
    foreach ($wf in $wfs) {
        $n = [System.IO.Path]::GetFileNameWithoutExtension($wf)
        $cands = @("${n}_$persona.qmd", "${n}_$persona.md", "${n}.qmd", "${n}.md")
        $found = $null
        foreach ($c in $cands) { if (Test-Path (Join-Path $srcBase "sterileAgent\$c")) { $found = Join-Path $srcBase "sterileAgent\$c"; break } }
        if ($found) { Invoke-SmartCopy $found (Join-Path $target $wf) }
    }
}

# ==============================================================================
# 🚀 MAIN FLOW
# ==============================================================================

try {
    $src = Assert-SafePath $PSScriptRoot
    $agent = Join-Path $TargetDir ".agent"
    $persona = Resolve-Persona $Persona $Silent $agent
    $log = Join-Path $agent "install.log"
    
    Write-Host "?? Initializing C* In: $TargetDir" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path (Join-Path $agent "workflows"), (Join-Path $agent "scripts"), (Join-Path $agent "skills") -Force | Out-Null
    
    Deploy-Workflows $src (Join-Path $agent "workflows") $persona
    
    @("sv_engine.py", "install_skill.py", "personas.py", "ui.py", "annex.py") | ForEach-Object {
        Invoke-SmartCopy (Join-Path $src ".agent\scripts\$_") (Join-Path $agent "scripts\$_")
    }

    if (Test-Path (Join-Path $src ".agent\scripts\engine")) {
        $eDir = Join-Path $agent "scripts\engine"
        New-Item -ItemType Directory $eDir -Force | Out-Null
        Get-ChildItem (Join-Path $src ".agent\scripts\engine") -Filter "*.py" | ForEach-Object {
            Invoke-SmartCopy $_.FullName (Join-Path $eDir $_.Name)
        }
    }
    
    Write-Host "`n[+] Installation Complete." -ForegroundColor Green
}
catch { Write-Error "FATAL: $_"; exit 1 }
