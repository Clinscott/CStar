import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from pathlib import Path
from src.core.engine.ravens.muninn_hunter import MuninnHunter

@pytest.fixture
def hunter():
    with patch("src.core.engine.ravens.muninn_hunter.MissionCoordinator"):
        return MuninnHunter(Path("/tmp/root"), MagicMock())

@pytest.mark.asyncio
async def test_execute_hunt_success(hunter):
    mock_mission = {"mission_id": "123"}
    hunter.coordinator.select_mission.return_value = mock_mission
    
    with patch("src.core.engine.ravens.muninn_hunter.SovereignHUD"):
        missions, meta = await hunter.execute_hunt()
        
        assert len(missions) == 1
        assert missions[0] == mock_mission
        assert meta["count"] == 1
        assert meta["source"] == "hall_beads"

@pytest.mark.asyncio
async def test_execute_hunt_no_mission(hunter):
    hunter.coordinator.select_mission.return_value = None
    
    with patch("src.core.engine.ravens.muninn_hunter.SovereignHUD"):
        missions, meta = await hunter.execute_hunt()
        
        assert len(missions) == 0
        assert meta["count"] == 0

def test_select_target_hall_beads(hunter):
    breaches = [{"compatibility_source": "hall_beads", "id": "1"}]
    target = hunter.select_target(breaches)
    assert target == breaches[0]

def test_select_target_fallback(hunter):
    hunter.coordinator.select_mission.return_value = {"id": "2"}
    target = hunter.select_target([])
    assert target == {"id": "2"}
