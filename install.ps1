# AgLng Framework Installation Script
# Usage: .\install.ps1 -TargetDir "path\to\your\project"

param (
    [string]$TargetDir = (Get-Location).Path
)

$SourceBase = "c:\Users\Craig\Corvus\CorvusStar"
$AgentDir = Join-Path $TargetDir ".agent"
$WorkflowDir = Join-Path $AgentDir "workflows"
$ScriptDir = Join-Path $AgentDir "scripts"
$SkillDir = Join-Path $AgentDir "skills"

Write-Host "🚀 Initializing AgLng Framework in: $TargetDir" -ForegroundColor Cyan

# 1. Create Directory Structure
New-Item -ItemType Directory -Path $WorkflowDir, $ScriptDir, $SkillDir -Force | Out-Null

# 2. Deploy Sterile Workflows
$Workflows = "lets-go.md", "run-task.md", "investigate.md", "wrap-it-up.md", "SovereignFish.md"
foreach ($wf in $Workflows) {
    Copy-Item -Path (Join-Path $SourceBase "sterileAgent\$wf") -Destination $WorkflowDir -Force
}

# 3. Deploy Engine Scripts
Copy-Item -Path (Join-Path $SourceBase ".agent\scripts\sv_engine.py") -Destination $ScriptDir -Force

# 4. Deploy Skills Ecosystem
Copy-Item -Path (Join-Path $SourceBase ".agent\skills\*") -Destination $SkillDir -Recurse -Force

# 5. Deploy Context Templates & Logic
$Templates = "AGENTS.md", "wireframe.md", "dev_journal.md", "thesaurus.md", "fishtest_data.json", "tasks.md", "memories.md"
foreach ($tpl in $Templates) {
    if (-not (Test-Path (Join-Path $TargetDir $tpl))) {
        Copy-Item -Path (Join-Path $SourceBase "sterileAgent\$tpl") -Destination $TargetDir -Force
    }
}

# 6. Initialize Corrections
if (-not (Test-Path (Join-Path $AgentDir "corrections.json"))) {
    '{"phrase_mappings": {}, "synonym_updates": {}}' | Out-File -FilePath (Join-Path $AgentDir "corrections.json") -Encoding utf8
}

Write-Host "✅ Installation Complete. System is AgLng Ready." -ForegroundColor Green
Write-Host "Run 'python .agent/scripts/sv_engine.py --help' to verify the engine." -ForegroundColor Gray
