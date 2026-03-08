import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path

from src.core.engine.cognitive_router import CognitiveRouter
from src.core.engine.atomic_gpt import WardenCircuitBreaker
from src.core.engine.heimdall_shield import ShieldTrip

@pytest.fixture
def mock_router(tmp_path):
    # Setup mock file structure so router doesn't fail on __init__
    (tmp_path / ".agents" / "skills").mkdir(parents=True)
    (tmp_path / ".agents" / "workflows").mkdir()
    hunt_dir = tmp_path / "src" / "skills" / "local" / "WildHunt"
    hunt_dir.mkdir(parents=True)
    
    # Create the mock hunt script
    hunt_script = hunt_dir / "wild_hunt.py"
    hunt_script.write_text("# mock", encoding="utf-8")
    
    # Create the router
    router = CognitiveRouter(tmp_path)
    
    # Mock Mimir for Thinking and Target Acquisition
    with patch('src.core.engine.cognitive_router.mimir.think', new_callable=AsyncMock) as mock_think:
        mock_think.return_value = '{"goal": "mock_goal", "required_tools": ["mock_tool"], "required_workflows": []}'
        
        with patch('src.core.engine.cognitive_router.mimir.search_well', new_callable=AsyncMock) as mock_search:
            mock_search.return_value = "Mock Search Results"
            
            router.warden.get_lore_alignment = AsyncMock(return_value=1.0)
            router.warden.forward = MagicMock(return_value=0.1) # Safe score
            
            yield router

@pytest.mark.asyncio
async def test_route_intent_success(mock_router):
    """[Ω] Ensures a safe intent routes cleanly through translation, wild hunt, and execution."""
    
    # Mock the subprocess execution to prevent actual shell calls
    with patch.object(mock_router, '_secure_execute', return_value=MagicMock(returncode=0)) as mock_exec:
        result = await mock_router.route_intent("Do a mock task", "mock_target.py")
        
        # Should succeed
        assert result.get("status") == "success"
        
        # Verify mimir.think was called (once for translation, once for learning session)
        from src.core.mimir_client import mimir
        assert mimir.think.call_count >= 2

@pytest.mark.asyncio
async def test_route_intent_loki_mode_override(mock_router):
    """[Ω] Ensures Loki mode drops the circuit breaker threshold."""
    
    # Make Warden return 0.6 (Dangerous for Loki, Safe for Standard)
    mock_router.warden.forward = MagicMock(return_value=0.6)
    
    # Standard Mode should pass (0.6 <= 0.8)
    # We mock out execution to prevent it trying to do things
    with patch.object(mock_router, '_execute_forge', new_callable=AsyncMock) as mock_forge:
        mock_forge.return_value = {"status": "success"}
        result = await mock_router.route_intent("Standard task", "target.py", loki_mode=False)
        assert result.get("status") == "success"

    # Loki Mode should fail (0.6 > 0.5)
    result_loki = await mock_router.route_intent("Loki task", "target.py", loki_mode=True)
    assert result_loki.get("status") == "error"
    assert "high probability" in result_loki.get("message")
    assert "Loki Mode" in result_loki.get("message")

@pytest.mark.asyncio
async def test_route_intent_shield_trip(mock_router):
    """[Ω] Ensures Heimdall Shield trips are caught and abort the routing."""
    
    # We mock the _execute_forge to raise a ShieldTrip
    with patch.object(mock_router, '_execute_forge', new_callable=AsyncMock) as mock_forge:
        mock_forge.side_effect = ShieldTrip("Mock Shield Trip")
        
        result = await mock_router.route_intent("Dangerous task", "target.py")
        
        assert result.get("status") == "error"
        assert "Mock Shield Trip" in result.get("message")

@pytest.mark.asyncio
async def test_route_intent_lease_collision(mock_router):
    """[Ω] Ensures intent routing fails gracefully if the target is locked by another Raven."""
    
    # Manually lock the target using another agent ID
    target = "mock_target.py"
    mock_router.lease_manager.acquire_lease(target, "OTHER-RAVEN")
    
    result = await mock_router.route_intent("Locked task", target)
    
    assert result.get("status") == "error"
    assert "locked by other Ravens" in result.get("message")
