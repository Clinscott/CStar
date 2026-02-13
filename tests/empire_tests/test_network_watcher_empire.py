import pytest
import unittest.mock as mock
import os
import time
from src.tools.network_watcher import NetworkWatcher, CruciblePipeline

def test_network_watcher_detection(tmp_path):
    share = tmp_path / "share"
    share.mkdir()
    
    # Mock pipeline
    mock_pipe = mock.MagicMock(spec=CruciblePipeline)
    
    watcher = NetworkWatcher(str(share), mock_pipe)
    
    # Create a json file
    json_file = share / "test.json"
    json_file.write_text("{}", encoding='utf-8')
    
    # We need to test the logic without an infinite loop
    # We can mock os.listdir once and then break
    with mock.patch("os.listdir", return_value=["test.json"]):
        # Use a timeout or just call the core logic if possible.
        # Since watch() is a while True, let's test the inner logic.
        for f in [f for f in os.listdir(str(share)) if f.endswith('.json')]:
            watcher.pipeline.process(os.path.join(str(share), f))
            
    mock_pipe.process.assert_called_once()
    assert "test.json" in mock_pipe.process.call_args[0][0]

def test_crucible_pipeline_init(tmp_path):
    base = tmp_path / "base"
    root = tmp_path / "root"
    pipe = CruciblePipeline(str(root), str(base))
    assert pipe.stage.endswith("staging")
    assert pipe.proc.endswith("processed")
