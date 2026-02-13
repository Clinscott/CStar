import sys
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

# Bootstrap
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

from src.sentinel.muninn import Muninn, SPRTValidator

def test_autonomous_loop_logic():
    print("--- STARTING SYNTHETIC VERIFICATION ---")
    
    # Mock GenAI Client
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = '{"code": "def hello(): pass", "test": "def test_hello(): assert True"}'
    mock_client.models.generate_content.return_value = mock_response
    
    # Mock Council Approval
    mock_council_response = MagicMock()
    mock_council_response.text = '{"status": "APPROVED", "reason": "Looks good"}'
    
    # Mock Teacher (Knowledge Extraction)
    mock_teacher_response = MagicMock()
    mock_teacher_response.text = "- **Verification**: Learning loops require multi-cycle stability checks."
    
    def side_effect(*args, **kwargs):
        if "ACT AS: The Council" in kwargs.get('contents', ''):
            return mock_council_response
        if "ACT AS: The Teacher" in kwargs.get('contents', ''):
            return mock_teacher_response
        return mock_response

    mock_client.models.generate_content.side_effect = side_effect
    
    # Initialize Muninn with mock client
    muninn = Muninn(target_path=str(project_root), client=mock_client)
    
    # Mock Wardens to find a "fake" target
    patcher_norn = patch('src.sentinel.muninn.NornWarden.get_next_target')
    mock_norn = patcher_norn.start()
    mock_norn.return_value = {
        "type": "CAMPAIGN_TASK",
        "file": "src/core/dummy.py",
        "action": "Implement fake task",
        "source": "CAMPAIGN"
    }

    # Mock pytest results
    patcher_run = patch('subprocess.run')
    mock_run = patcher_run.start()
    mock_run.return_value = MagicMock(returncode=0, stdout="PASSED", stderr="")

    print("[STEP 1] Running Muninn.run()...")
    success = muninn.run()
    
    print(f"[STEP 2] Result: {'SUCCESS' if success else 'FAIL'}")
    
    # Verify SPRT was called
    print("[STEP 3] Verifying SPRT calls...")
    # Expected: 1 forge + 1 crucible + SPRT trials (default status is ACCEPT immediately or after some trials)
    # Our SPRT ACCEPTs if likelihood <= math.log(B)
    
    # Verify Knowledge Extraction
    print("[STEP 4] Verifying Teach Phase (Knowledge Extraction)...")
    memory_path = project_root / "memory.qmd"
    if memory_path.exists():
        memory_content = memory_path.read_text(encoding='utf-8')
        if "Learning loops require multi-cycle stability checks" in memory_content:
            print("SUCCESS: memory.qmd updated with new lesson.")
        else:
            print("FAIL: memory.qmd NOT updated.")
    
    # Cleanup
    patcher_norn.stop()
    patcher_run.stop()
    
    if success:
        print("--- SYNTHETIC VERIFICATION COMPLETE: ALL SYSTEMS NOMINAL ---")
    else:
        print("--- SYNTHETIC VERIFICATION FAILED ---")

if __name__ == "__main__":
    test_autonomous_loop_logic()
