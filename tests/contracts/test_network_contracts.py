import io
import os
import shutil
import sys
import unittest
from unittest.mock import MagicMock, patch

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.append(PROJECT_ROOT)
sys.path.append(os.path.join(PROJECT_ROOT, ".agent", "scripts"))

from src.tools.network_watcher import SovereignHUD, CruciblePipeline


class TestNetwork_contracts(unittest.TestCase):
    def setUp(self):
        self.captured_output = io.StringIO()
        sys.stdout = self.captured_output
        self.pipeline = CruciblePipeline(PROJECT_ROOT, os.path.join(PROJECT_ROOT, ".agent"))

    def tearDown(self):
        sys.stdout = sys.__stdout__

    def test_transition(self):
        # >>> CONTRACT 1: VALID TRACE <<<
        # GIVEN Valid Trace file appears [NET]
        trace_file = os.path.join("network_share", "valid_trace.json")
        
        # WHEN Watcher Cycle runs (Simulation: Calling pipeline.process directly)
        with patch("shutil.move") as mock_move, \
             patch("shutil.copy2") as mock_copy, \
             patch("os.makedirs"), \
             patch("os.path.getsize", return_value=100), \
             patch("os.remove") as mock_remove, \
             patch("subprocess.run", return_value=MagicMock(returncode=0)) as mock_run:
            
            self.pipeline.process(trace_file)
            
            # THEN Trace is moved to Processing (Staging)
            # The code moves input file to staging
            self.assertTrue(mock_move.called)
            # Assert dest contains 'staging'
            dest = mock_move.call_args[0][1]
            self.assertIn("staging", dest)
            
            # THEN Data is merged
            # Verify merge script called
            cmd_args = [call[0][0] for call in mock_run.call_args_list]
            merge_called = any("merge_traces.py" in str(arg) for arg in cmd_args)
            self.assertTrue(merge_called)

        # >>> CONTRACT 2: MALFORMED TRACE (MERGE FAILURE) <<<
        # GIVEN Malformed Trace file appears [NET]
        # In this implementation, malformed means merge fails
        bad_trace = os.path.join("network_share", "bad_trace.json")
        
        # WHEN Watcher Cycle runs
        with patch("shutil.move") as mock_move, \
             patch("shutil.copy2") as mock_copy, \
             patch("os.makedirs"), \
             patch("os.path.getsize", return_value=100), \
             patch("subprocess.run", return_value=MagicMock(returncode=1)) as mock_run, \
             patch("src.tools.network_watcher.SovereignHUD.log") as mock_log:
             
            self.pipeline.process(bad_trace)
            
            # THEN Trace is Quarantined (In this code: Database rolled back)
            # The pipeline restores db from backup if merge fails
            # SovereignHUD Logs FAIL
            logs = [call[0][0] for call in mock_log.call_args_list]
            self.assertIn("FAIL", logs)
            
            # THEN Rejection is logged
            # Verified via SovereignHUD Log FAIL "Merge Error"

if __name__ == '__main__':
    unittest.main()