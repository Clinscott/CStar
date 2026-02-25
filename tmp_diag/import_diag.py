
import sys
from pathlib import Path

# Add project root and other likely paths
PROJECT_ROOT = Path("c:/Users/Craig/Corvus/CorvusStar")
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT / "src/core"))
sys.path.insert(0, str(PROJECT_ROOT / "src/core/engine"))
sys.path.insert(0, str(PROJECT_ROOT / "src/tools/debug"))

test_files = [
    "tests/contracts/test_muninn.py",
    "tests/contracts/test_strategists_bonus.py",
    "tests/empire_tests/test_check_pro_empire.py",
    "tests/empire_tests/test_edda_audit_empire.py",
    "tests/empire_tests/test_freya_aesthetics_empire.py",
    "tests/empire_tests/test_harvest_responses_empire.py",
    "tests/empire_tests/test_muninn_empire.py",
    "tests/empire_tests/test_muninn_memory_idempotency_empire.py",
    "tests/empire_tests/test_muninn_naming_empire.py",
    "tests/empire_tests/test_muninn_real_empire.py",
    "tests/empire_tests/test_norn_campaign_empire.py",
    "tests/empire_tests/test_runecaster_audit_empire.py",
    "tests/empire_tests/test_scout_targets_empire.py",
    "tests/empire_tests/test_thewatcher_integrity_empire.py",
    "tests/empire_tests/test_valkyrie_audit_empire.py",
    "tests/empire_tests/test_valkyrie_empire.py",
    "tests/harness/stress_test.py",
    "tests/unit/test_muninn.py"
]

for f in test_files:
    print(f"Attempting to import {f}...")
    try:
        # Convert path to module name format
        module_path = f.replace(".py", "").replace("/", ".")
        __import__(module_path)
        print("  SUCCESS")
    except Exception as e:
        print(f"  FAILED: {e}")
        import traceback
        traceback.print_exc()
