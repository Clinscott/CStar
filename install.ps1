# Corvus Star Framework Installation Script
# Usage: .\install.ps1 -TargetDir "path\to\your\project"

param (
    [string]$TargetDir = (Get-Location).Path
)

# Dynamic Source Resolution (Portability)
$SourceBase = $PSScriptRoot
if (-not $SourceBase) {
    Write-Error "FATAL: Cannot determine script location. Run the script from its file path."
    exit 1
}

# Validate Source Integrity
$requiredPaths = @(
    (Join-Path $SourceBase ".agent\scripts\sv_engine.py"),
    (Join-Path $SourceBase "sterileAgent\AGENTS.md")
)
foreach ($path in $requiredPaths) {
    if (-not (Test-Path $path)) {
        Write-Error "FATAL: Source integrity check failed. Missing: $path"
        exit 1
    }
}

$AgentDir = Join-Path $TargetDir ".agent"
$WorkflowDir = Join-Path $AgentDir "workflows"
$ScriptDir = Join-Path $AgentDir "scripts"
$SkillDir = Join-Path $AgentDir "skills"

# Initialize logging early (before directory creation to catch errors)
$LogPath = Join-Path $AgentDir "install.log"

function Get-UserChoice {
    param ([string]$FilePath)
    Write-Host "`n?? Conflict detected: $FilePath" -ForegroundColor Yellow
    Write-Host "[S] Skip  [O] Overwrite  [M] Merge (Unique)  [D] Diff  [Q] Quit" -ForegroundColor White
    $choice = Read-Host "Choose an action"
    return $choice.ToUpper()
}

function Get-PersonaChoice {
    Clear-Host
    Write-Host "============================" -ForegroundColor Cyan
    Write-Host "   CORVUS STAR INIT v1.0    " -ForegroundColor White
    Write-Host "============================" -ForegroundColor Cyan
    
    Write-Host "`n?? Choose your Corvus Star Persona:" -ForegroundColor Cyan
    Write-Host "  [1] COMPLETE DOMINATION (God Mode)" -ForegroundColor Red
    Write-Host "      - The engine is law. Files are sacred. Over-dramatic."
    Write-Host "  [2] Humble Servant (Alfred Mode)" -ForegroundColor Green
    Write-Host "      - Optimized options. Polite suggestions. Works in the background."
    
    while ($true) {
        $choice = Read-Host "Select Persona [1/2]"
        switch ($choice) {
            "1" { return "GOD" }
            "2" { return "ALFRED" }
            default { Write-Host "Please select 1 or 2." -ForegroundColor Yellow }
        }
    }
}

function Invoke-SmartMerge {
    param ([string]$Source, [string]$Dest)
    
    # Safety Backup
    Copy-Item $Dest "$Dest.bak" -Force
    
    $ext = [System.IO.Path]::GetExtension($Dest).ToLower()
    
    if ($ext -eq ".json") {
        # Simple JSON Merge (Flat keys)
        $sObj = Get-Content $Source -Raw | ConvertFrom-Json
        $dObj = Get-Content $Dest -Raw | ConvertFrom-Json
        $merged = $dObj
        foreach ($prop in $sObj.PSObject.Properties) {
            if (-not $dObj.PSObject.Properties[$prop.Name]) {
                $merged | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value
            }
        }
        $merged | ConvertTo-Json -Depth 10 | Out-File -FilePath $Dest -Encoding utf8
    }
    else {
        # Smart Text Merge 2.0
        $sLines = Get-Content $Source
        $dLines = Get-Content $Dest -Raw
        
        # Check if Source has headers like ## Header
        $sections = $sLines | Select-String -Pattern "^## "
        
        if ($sections) {
            # Advanced: Replace sections if they exist in Dest
            $newContent = $dLines
            foreach ($sec in $sections) {
                $header = $sec.Line
                if ($newContent -match [regex]::Escape($header)) {
                    # Logic to be implemented in vNext: For now, we still append but warn
                    Write-Host "    ! Section collision detected: $header (Manual check advised)" -ForegroundColor Yellow
                }
            }
        }
        
        $dLinesArr = Get-Content $Dest
        $newLines = $sLines | Where-Object { $dLinesArr -notcontains $_ }
        
        if ($newLines) {
            $combined = @()
            $combined += $dLinesArr
            $combined += ""
            $combined += "### Corvus Star Additions ###"
            $combined += $newLines
            $combined | Out-File -FilePath $Dest -Encoding utf8
        }
    }
}

function Write-Log {
    param (
        [string]$Message,
        [string]$Path
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] $Message"
    
    # Ensure parent directory exists
    $parentDir = Split-Path $Path -Parent
    if ($parentDir -and -not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    
    Add-Content -Path $Path -Value $entry -ErrorAction SilentlyContinue
}

function Invoke-DependencyCheck {
    param (
        [string]$LogPath
    )
    
    $dependencies = @("ruff", "radon")
    $pythonCmd = $null
    
    # Step 1: Find a usable Python interpreter
    foreach ($cmd in @("python", "python3", "py")) {
        try {
            $version = & $cmd --version 2>&1
            if ($version -match "Python 3\.\d+") {
                $pythonCmd = $cmd
                Write-Log "Found Python: $version" -Path $LogPath
                break
            }
        }
        catch {
            # Command not found, continue to next
        }
    }
    
    if (-not $pythonCmd) {
        Write-Log "ERROR: No Python 3 interpreter found. Dependencies NOT installed." -Path $LogPath
        Write-Warning "?? Python 3 not found. Please install dependencies manually: pip install ruff radon"
        return $false
    }
    
    # Step 2: Check for pip
    try {
        $pipCheck = & $pythonCmd -m pip --version 2>&1
        if ($pipCheck -notmatch "pip") {
            throw "pip not available"
        }
    }
    catch {
        Write-Log "ERROR: pip not available for $pythonCmd" -Path $LogPath
        Write-Warning "?? pip not found. Please install dependencies manually."
        return $false
    }
    
    # Step 3: Install each dependency
    foreach ($dep in $dependencies) {
        Write-Host "  ?? Installing $dep..." -ForegroundColor Gray
        try {
            $result = & $pythonCmd -m pip install --upgrade --quiet $dep 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw $result
            }
            Write-Log "SUCCESS: Installed $dep" -Path $LogPath
        }
        catch {
            Write-Log "WARNING: Failed to install $dep - $_" -Path $LogPath
            Write-Warning "?? Could not install $dep. Manual install may be required."
        }
    }
    
    return $true
}

function Invoke-SmartCopy {
    param ([string]$Source, [string]$Dest)

    
    if (-not (Test-Path $Dest)) {
        Copy-Item -Path $Source -Destination $Dest -Force
        Write-Host "  + Created: $(Split-Path $Dest -Leaf)" -ForegroundColor Gray
        return
    }

    $sourceHash = (Get-FileHash $Source).Hash
    $destHash = (Get-FileHash $Dest).Hash

    if ($sourceHash -eq $destHash) {
        Write-Host "  = Identical: $(Split-Path $Dest -Leaf)" -ForegroundColor Gray
        return
    }

    while ($true) {
        $choice = Get-UserChoice -FilePath $Dest
        switch ($choice) {
            "S" { Write-Host "  - Skipped: $(Split-Path $Dest -Leaf)" -ForegroundColor Cyan; break }
            "O" { 
                Copy-Item -Path $Source -Destination $Dest -Force
                Write-Host "  * Overwritten: $(Split-Path $Dest -Leaf)" -ForegroundColor Green
                break 
            }
            "M" {
                Invoke-SmartMerge -Source $Source -Dest $Dest
                Write-Host "  + Merged: $(Split-Path $Dest -Leaf)" -ForegroundColor Magenta
                break
            }
            "D" { Show-Diff -Source $Source -Dest $Dest; continue }
            "Q" { Write-Host "? Installation Aborted." -ForegroundColor Red; exit }
            default { Write-Host "Invalid choice." -ForegroundColor Red; continue }
        }
        break
    }
}

Write-Host "?? Initializing Corvus Star (C*) Framework in: $TargetDir" -ForegroundColor Cyan

# 0. Select Persona (Early Binding)
$Persona = Get-PersonaChoice

# 1. Create Directory Structure
New-Item -ItemType Directory -Path $WorkflowDir, $ScriptDir, $SkillDir -Force | Out-Null

# 1b. Initialize Logging
Write-Log "=== Installation Started ===" -Path $LogPath
Write-Log "Source: $SourceBase" -Path $LogPath
Write-Log "Target: $TargetDir" -Path $LogPath
Write-Log "Persona: $Persona" -Path $LogPath

# 2. Deploy Sterile Workflows
$Workflows = "lets-go.md", "run-task.md", "investigate.md", "wrap-it-up.md", "SovereignFish.md"
foreach ($wf in $Workflows) {
    Invoke-SmartCopy -Source (Join-Path $SourceBase "sterileAgent\$wf") -Dest (Join-Path $WorkflowDir $wf)
}

# 3. Deploy Engine Scripts
$engineFiles = @(
    "sv_engine.py",
    "install_skill.py",
    "personas.py",
    "set_persona.py",
    "synapse_sync.py",
    "ui.py"
)
foreach ($file in $engineFiles) {
    $src = Join-Path $SourceBase ".agent\scripts\$file"
    $dst = Join-Path $ScriptDir $file
    if (Test-Path $src) {
        Invoke-SmartCopy -Source $src -Dest $dst
        Write-Log "Deployed: $file" -Path $LogPath
    }
    else {
        Write-Warning "Optional engine file not found: $file (Skipping)"
        Write-Log "WARNING: Missing source file: $file" -Path $LogPath
    }
}

# 3b. Deploy Engine Module (Iron Core)
$EngineModuleDir = Join-Path $ScriptDir "engine"
if (Test-Path (Join-Path $SourceBase ".agent\scripts\engine")) {
    New-Item -ItemType Directory -Path $EngineModuleDir -Force | Out-Null
    Get-ChildItem (Join-Path $SourceBase ".agent\scripts\engine") -Filter "*.py" | ForEach-Object {
        $src = $_.FullName
        $dst = Join-Path $EngineModuleDir $_.Name
        Invoke-SmartCopy -Source $src -Dest $dst
        Write-Log "Deployed: engine/$($_.Name)" -Path $LogPath
    }
}

# 3c. Deploy Dialogue Database
$DialogueDir = Join-Path $TargetDir "dialogue_db"
if (-not (Test-Path $DialogueDir)) { New-Item -ItemType Directory -Path $DialogueDir -Force | Out-Null }
Invoke-SmartCopy -Source (Join-Path $SourceBase "dialogue_db\odin.md") -Dest (Join-Path $DialogueDir "odin.md")
Invoke-SmartCopy -Source (Join-Path $SourceBase "dialogue_db\alfred.md") -Dest (Join-Path $DialogueDir "alfred.md")

# 4. Deploy Skills Ecosystem
if (Test-Path (Join-Path $SourceBase ".agent\skills")) {
    Get-ChildItem (Join-Path $SourceBase ".agent\skills") -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
        $relative = $_.FullName.Substring((Join-Path $SourceBase ".agent\skills").Length + 1)
        $destFile = Join-Path $SkillDir $relative
        $destFolder = Split-Path $destFile
        if (-not (Test-Path $destFolder)) { New-Item -ItemType Directory -Path $destFolder -Force | Out-Null }
        Invoke-SmartCopy -Source $_.FullName -Dest $destFile
    }
}

# 5. Deploy Context Templates
$Templates = "AGENTS.md", "wireframe.md", "dev_journal.md", "thesaurus.md", "fishtest_data.json", "tasks.md", "memories.md"
foreach ($tpl in $Templates) {
    Invoke-SmartCopy -Source (Join-Path $SourceBase "sterileAgent\$tpl") -Dest (Join-Path $TargetDir $tpl)
}

# 6. Initialize Config & Corrections
$configPath = Join-Path $AgentDir "config.json"
$installDate = Get-Date -Format "yyyy-MM-dd'T'HH:mm:ssK"
$gitHash = $null
try {
    $gitHash = (git -C $SourceBase rev-parse --short HEAD 2>$null)
}
catch {
    $gitHash = "unknown"
}

$configData = @{
    FrameworkRoot = $TargetDir
    Persona       = $Persona
    Version       = @{
        InstalledAt = $installDate
        SourceHash  = $gitHash
        Installer   = "install.ps1"
    }
} | ConvertTo-Json -Depth 3
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, $configData, $utf8NoBom)
Write-Host "  + Created: config.json" -ForegroundColor Gray
Write-Log "Config created with version stamp" -Path $LogPath

$correctionsPath = Join-Path $AgentDir "corrections.json"
if (-not (Test-Path $correctionsPath)) {
    '{"phrase_mappings": {}, "synonym_updates": {}}' | Out-File -FilePath $correctionsPath -Encoding utf8
    Write-Host "  + Initialized: corrections.json" -ForegroundColor Gray
}

# 7. Install Dependencies
Write-Host "`n[*] Checking Python dependencies..." -ForegroundColor Cyan
$depsInstalled = Invoke-DependencyCheck -LogPath $LogPath

Write-Host "`n[+] Installation Complete. System is C* Ready." -ForegroundColor Green
Write-Host "Run 'python .agent/scripts/sv_engine.py --help' to verify the engine." -ForegroundColor Gray
Write-Log "=== Installation Complete ===" -Path $LogPath
Write-Host "[i] Installation log: $LogPath" -ForegroundColor Gray

