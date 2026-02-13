import pytest
import unittest.mock as mock
import json
from src.tools.update_gemini_manifest import update_manifest

def test_update_manifest_simple():
    # Direct mock of the logic dependencies
    with mock.patch("src.tools.update_gemini_manifest.get_task_status", return_value="Tasks OK"):
        with mock.patch("src.tools.update_gemini_manifest.get_git_summary", return_value="Git OK"):
            with mock.patch("src.tools.update_gemini_manifest.os.path.exists", return_value=True):
                # Mock open for BOTH config (read) and manifest (write)
                m = mock.mock_open(read_data='{"persona": "ODIN"}')
                with mock.patch("src.tools.update_gemini_manifest.open", m):
                    # We need to ensure json.load doesn't consume the same mock in a way that breaks
                    # but since we mock open, it returns the same mock object.
                    with mock.patch("json.load", return_value={"persona": "ODIN"}):
                         update_manifest()
                    
                    # Verify write calls
                    handle = m()
                    written = "".join(call[0][0] for call in handle.write.call_args_list)
                    assert "Active Mind: ODIN" in written
                    assert "Tasks OK" in written
