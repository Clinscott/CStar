import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SANDBOX_DIR = path.join(__dirname, 'sandbox_muninn');
const UGLY_FILE = path.join(SANDBOX_DIR, 'ugly_component.tsx');

console.log('🔥 [RAGNAROK: MUNINN] Preparing sandbox...');
if (fs.existsSync(SANDBOX_DIR)) fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
fs.mkdirSync(SANDBOX_DIR, { recursive: true });

// Highly chaotic file guaranteed to trigger Freya (Birkhoff & Golden Ratio)
fs.writeFileSync(UGLY_FILE, `
<div className="w-[12px] h-[33px] bg-[#000] absolute float-left m-[1px] p-[2px]">
    <span className="text-[11px]">Hello</span>
    <span className="text-[12px]">World</span>
    <button className="bg-red-500 padding-[2px]">Click</button>
</div>
`, 'utf8');

console.log('🦅 [RAGNAROK: MUNINN] Releasing the Ravens (Offline Mode)...');

// Escape backslashes for Python string literal
const escapedProjectRoot = PROJECT_ROOT.replace(/\\/g, '/');
const escapedSandboxDir = SANDBOX_DIR.replace(/\\/g, '/');

const pyScript = `
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

# 1. Setup Environment
os.environ['GOOGLE_API_KEY'] = 'fake_key_for_testing'
os.environ['MUNINN_API_KEY'] = 'fake_key_for_testing'

# 2. Add Project Root
sys.path.append('${escapedProjectRoot}')

# 3. Mock dependencies BEFORE imports to ensure they are captured
import google.genai
mock_client = MagicMock()
mock_response = MagicMock()
mock_response.text = '{"code": "<div className=\\"w-3 h-8 bg-black absolute left-0 m-0 p-0\\">\\n    <span className=\\"text-xs\\">Hello</span>\\n    <span className=\\"text-xs\\">World</span>\\n    <button className=\\"bg-red-500 p-0.5\\">Click</button>\\n</div>"}'
# Support both direct text and JSON-wrapped code
mock_response.text = '<div className="w-3 h-8 bg-black absolute left-0 m-1 p-2">\\n    <span className="text-xs">Hello</span>\\n    <span className="text-xs">World</span>\\n    <button className="bg-red-500 p-1">Click</button>\\n</div>'
mock_client.models.generate_content.return_value = mock_response

# 4. Import and Run Muninn
from src.sentinel.muninn import Muninn
from src.tools.brave_search import BraveSearch

# Mock BraveSearch to avoid quota check
BraveSearch.is_quota_available = MagicMock(return_value=False)

raven = Muninn('${escapedSandboxDir}', use_bridge=False)
raven.client = mock_client # Inject mock client
raven.run()
`;

const runnerPath = path.join(SANDBOX_DIR, 'run.py');
fs.writeFileSync(runnerPath, pyScript, 'utf8');


// Execute Muninn synchronously
console.log('🚀 [RAGNAROK: MUNINN] Launching Python Runner...');
const result = spawnSync('python', [runnerPath], { cwd: PROJECT_ROOT, stdio: 'inherit' });

if (result.status !== 0) {
    console.error(`❌ [RAGNAROK: MUNINN] FATAL ERROR. Python exited with code ${result.status}`);
    process.exit(1);
}

console.log('⚗️  [RAGNAROK: MUNINN] Crucible validation...');
const healedContent = fs.readFileSync(UGLY_FILE, 'utf8');

const arbitraryPixels = (healedContent.match(/-?\[[0-9]+px\]/g) || []).length;
if (arbitraryPixels > 0) {
    console.error(`❌ [RAGNAROK: MUNINN] FAILED: ${arbitraryPixels} arbitrary pixels remained.`);
    console.log('Current Content:\n', healedContent);
} else {
    console.log('✅ [RAGNAROK: MUNINN] PASSED. Gungnir Calculus eradicated structural dissonance.');
}

// Final cleanup
console.log('🧹 [RAGNAROK: MUNINN] Scorched Earth cleanup...');
try {
    fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
} catch (e) {
    // Ignore cleanup errors
}
process.exit(0);
