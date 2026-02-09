# Corvus Star Framework Installation Script
# Usage: .\install.ps1 -TargetDir "path\to\your\project"

param (
    [string]$TargetDir = (Get-Location).Path
)

$SourceBase = "c:\Users\Craig\Corvus\CorvusStar"
$AgentDir = Join-Path $TargetDir ".agent"
$WorkflowDir = Join-Path $AgentDir "workflows"
$ScriptDir = Join-Path $AgentDir "scripts"
$SkillDir = Join-Path $AgentDir "skills"

function Get-UserChoice {
    param ([string]$FilePath)
    Write-Host "`n⚠️ Conflict detected: $FilePath" -ForegroundColor Yellow
    Write-Host "[S] Skip  [O] Overwrite  [M] Merge (Unique)  [D] Diff  [Q] Quit" -ForegroundColor White
    $choice = Read-Host "Choose an action"
    return $choice.ToUpper()
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
            "Q" { Write-Host "❌ Installation Aborted." -ForegroundColor Red; exit }
            default { Write-Host "Invalid choice." -ForegroundColor Red; continue }
        }
        break
    }
}

Write-Host "🚀 Initializing Corvus Star (C*) Framework in: $TargetDir" -ForegroundColor Cyan

# 1. Create Directory Structure
New-Item -ItemType Directory -Path $WorkflowDir, $ScriptDir, $SkillDir -Force | Out-Null

# 2. Deploy Sterile Workflows
$Workflows = "lets-go.md", "run-task.md", "investigate.md", "wrap-it-up.md", "SovereignFish.md"
foreach ($wf in $Workflows) {
    Invoke-SmartCopy -Source (Join-Path $SourceBase "sterileAgent\$wf") -Dest (Join-Path $WorkflowDir $wf)
}

# 3. Deploy Source Code (Core, Tools, Local Skills)
if (Test-Path (Join-Path $SourceBase "src")) {
    Get-ChildItem (Join-Path $SourceBase "src") -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
        $relative = $_.FullName.Substring((Join-Path $SourceBase "src").Length + 1)
        $destFile = Join-Path $TargetDir "src" $relative
        $destFolder = Split-Path $destFile
        if (-not (Test-Path $destFolder)) { New-Item -ItemType Directory -Path $destFolder -Force | Out-Null }
        Invoke-SmartCopy -Source $_.FullName -Dest $destFile
    }
}

# 5. Deploy Context Templates
$Templates = "AGENTS.md", "wireframe.md", "dev_journal.md", "thesaurus.md", "fishtest.py", "fishtest_data.json", "tasks.md", "memories.md"
foreach ($tpl in $Templates) {
    Invoke-SmartCopy -Source (Join-Path $SourceBase "sterileAgent\$tpl") -Dest (Join-Path $TargetDir $tpl)
}

# 6. Initialize Config & Corrections
$configPath = Join-Path $AgentDir "config.json"
$configData = @{
    FrameworkRoot = $SourceBase
} | ConvertTo-Json
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, $configData, $utf8NoBom)
Write-Host "  + Created: config.json" -ForegroundColor Gray

$correctionsPath = Join-Path $AgentDir "corrections.json"
if (-not (Test-Path $correctionsPath)) {
    '{"phrase_mappings": {}, "synonym_updates": {}}' | Out-File -FilePath $correctionsPath -Encoding utf8
    Write-Host "  + Initialized: corrections.json" -ForegroundColor Gray
}

Write-Host "`n✅ Installation Complete. System is C* Ready." -ForegroundColor Green
Write-Host "Run 'python .agent/scripts/sv_engine.py --help' to verify the engine." -ForegroundColor Gray
