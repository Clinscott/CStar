import pytest
import os
import json
import shutil
from odin_protocol.engine.persistence import OdinPersistence

def test_persistence_save_load(tmp_path):
    """Verify that save/load works for the genetic manifest."""
    # Setup mock project root
    project_root = str(tmp_path)
    # Create the folder structure persistence expects
    os.makedirs(os.path.join(project_root, "odin_protocol"))
    
    p = OdinPersistence(project_root)
    
    mock_state = {
        "seed": "C*TEST",
        "domination_count": 5,
        "inventory": {"TRAIT1": {"id": "TRAIT1", "name": "Test", "level": 2}},
        "conquests": []
    }
    
    # We won't test the actual git commit here as subprocess might fail in tmp without git init
    # But we can test the file saving logic
    p.save_state(mock_state, "Test Planet", "VICTORY")
    
    loaded = p.load_state()
    assert loaded["seed"] == "C*TEST"
    assert loaded["domination_count"] == 5
    assert loaded["inventory"]["TRAIT1"]["level"] == 2
    
    # Check if world file was created
    worlds_dir = os.path.join(project_root, "odin_protocol", "worlds")
    world_files = os.listdir(worlds_dir)
    assert len(world_files) == 1
    assert "test_planet" in world_files[0]
