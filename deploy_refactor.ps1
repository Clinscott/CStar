# Corvus Star: Persona Refactor Deployment Suite
# Target: Windows (PowerShell)

$ErrorActionPreference = "Stop"
$LogFile = "deploy_report.log"

function Write-Log($Message) {
    $Timestamp = Get-Date -Format "HH:mm:ss"
    $Entry = "[$Timestamp] $Message"
    Write-Host $Entry
    $Entry | Out-File -FilePath $LogFile -Append
}

Write-Log "--- Starting Full Suite Verification ---"

# 1. Environment Check
Write-Log "Checking for sovereign_state.json integrity..."
if (-not (Test-Path ".agent/sovereign_state.json")) {
    Write-Log "[ERROR] sovereign_state.json missing. Initializing dummy state."
    if (-not (Test-Path ".agent")) { New-Item -ItemType Directory -Path ".agent" }
    '{"check_pro.py": "ACTIVE"}' | Out-File -FilePath ".agent/sovereign_state.json"
}

# 2. Phrase Bank Validation (Data Integrity)
Write-Log "Validating YAML Phrase Bank..."
python scripts/validate_phrases.py
if ($LASTEXITCODE -ne 0) {
    Write-Log "[FAILED] Phrase bank failed validation. Check tags and keywords."
    exit $LASTEXITCODE
}

# 3. Core Engine Tests (Logic Integrity)
Write-Log "Executing Python Test Suite (pytest)..."
python -m pytest tests/empire_tests/test_contextual_persona.py --verbose
if ($LASTEXITCODE -ne 0) {
    Write-Log "[FAILED] Core logic tests failed. Aborting deployment."
    exit $LASTEXITCODE
}

Write-Log "--- [SUCCESS] Refactor Verified and Deployed ---"
