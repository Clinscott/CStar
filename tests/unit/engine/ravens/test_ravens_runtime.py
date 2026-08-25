import asyncio
from unittest.mock import AsyncMock

from src.core.engine.ravens.ravens_runtime import execute_ravens_cycle, execute_ravens_cycle_contract
from src.core.engine.ravens.retired import RAVENS_DECOMMISSIONED_CODE


def test_runtime_contract_returns_structured_read_only_rejection() -> None:
    uplink = AsyncMock()
    result = asyncio.run(execute_ravens_cycle_contract("/tmp/untrusted", uplink=uplink))

    assert result.status == "FAILURE"
    assert result.mission_id == "compatibility:ravens-execution-rejected"
    assert result.metadata == {
        "adapter": "compatibility:ravens-execution-rejected",
        "requested_project_root": "/tmp/untrusted",
        "decommissioned": True,
        "read_only": True,
        "execution_attempted": False,
        "error_code": RAVENS_DECOMMISSIONED_CODE,
    }
    uplink.assert_not_called()


def test_runtime_boolean_facade_never_claims_success() -> None:
    assert asyncio.run(execute_ravens_cycle("/tmp/untrusted")) is False
