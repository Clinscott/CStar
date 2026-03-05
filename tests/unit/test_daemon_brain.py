import pytest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
import time

from src.cstar.core.daemon import CStarDaemon


@pytest.fixture
def mock_daemon():
    daemon = CStarDaemon()
    daemon.uplink = AsyncMock()
    daemon.uplink.send_payload = AsyncMock(return_value={"status": "success", "response": "OK"})
    return daemon


@pytest.mark.asyncio
async def test_process_command_ask_routes_to_cognitive_router(mock_daemon):
    # Setup mock router response
    mock_router_instance = MagicMock()
    mock_router_instance.route_intent = AsyncMock(return_value={"status": "success", "message": "routed"})
    mock_router_instance.agent_id = "TEST_AGENT_1"

    with patch("src.core.engine.cognitive_router.CognitiveRouter", return_value=mock_router_instance):
        with patch("src.core.telemetry.SubspaceTelemetry.log_trace") as mock_trace:
            res = await mock_daemon.process_command("ask", [], "", command="ask", args=["how do i login?", "src/auth.py"])

            # Verify router was called
            mock_router_instance.route_intent.assert_called_once_with("how do i login?", "src/auth.py", loki_mode=False)
            assert res == {"status": "success", "message": "routed"}
            
            # Verify trace protocol for cognitive routing
            assert mock_trace.call_count >= 1
            
            # Find the routing trace call in the list of calls
            found_routing_trace = False
            for call in mock_trace.call_args_list:
                _, kwargs = call
                if kwargs.get("target_metric") == "COGNITIVE_ROUTING":
                    found_routing_trace = True
                    assert kwargs["file_path"] == "src/auth.py"
                    assert kwargs["status"] == "SUCCESS"
                    break
            
            assert found_routing_trace, "Expected COGNITIVE_ROUTING trace was not found."


@pytest.mark.asyncio
async def test_execute_sleep_protocol_closes_mimir(mock_daemon):
    mock_mimir = AsyncMock()
    mock_mimir.close = AsyncMock()
    
    with patch("src.cstar.core.daemon.mimir", mock_mimir):
        with patch("src.cstar.core.daemon.PROJECT_ROOT", MagicMock()):
            with patch("subprocess.Popen"):
                await mock_daemon.execute_sleep_protocol()
            
            # Verify mimir session is closed
            mock_mimir.close.assert_called_once()
