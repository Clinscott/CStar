import inspect
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.ravens_stage import RavensCycleResult
from src.core.engine.ravens.muninn import Muninn

RETIRED_HARNESS_ROUTES = (
    "tests/harness/manual_learn.py",
    "tests/harness/stress_test.py",
    "tests/harness/ragnarok_muninn.js",
    "tests/harness/ragnarok_bridge.js",
)


@pytest.fixture
def muninn_facade(tmp_path: Path) -> tuple[Muninn, MagicMock, MagicMock]:
    with (
        patch("src.cstar.core.uplink.AntigravityUplink") as uplink_class,
        patch("src.core.engine.ravens.muninn.MuninnHeart") as heart_class,
    ):
        muninn = Muninn(target_path=str(tmp_path))

    uplink_class.assert_called_once_with()
    heart_class.assert_called_once_with(tmp_path.resolve(), uplink_class.return_value)
    return muninn, heart_class.return_value, uplink_class.return_value


def test_muninn_constructs_the_supported_keyless_facade(
    muninn_facade: tuple[Muninn, MagicMock, MagicMock],
) -> None:
    muninn, heart, uplink = muninn_facade

    assert muninn.uplink is uplink
    assert muninn.heart is heart


@pytest.mark.asyncio
@pytest.mark.parametrize("cycle_result", [False, True])
async def test_run_cycle_delegates_to_the_heart(
    muninn_facade: tuple[Muninn, MagicMock, MagicMock],
    cycle_result: bool,
) -> None:
    muninn, heart, _uplink = muninn_facade
    heart.execute_cycle = AsyncMock(return_value=cycle_result)

    assert await muninn.run_cycle() is cycle_result
    heart.execute_cycle.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_run_cycle_contract_delegates_structured_result(
    muninn_facade: tuple[Muninn, MagicMock, MagicMock],
) -> None:
    muninn, heart, _uplink = muninn_facade
    result = RavensCycleResult(
        status="NO_ACTION",
        summary="No bounded mission is available.",
        mission_id="mission:test:no-action",
    )
    heart.execute_cycle_contract = AsyncMock(return_value=result)

    assert await muninn.run_cycle_contract() is result
    heart.execute_cycle_contract.assert_awaited_once_with()


def test_muninn_exposes_no_retired_client_or_run_api() -> None:
    parameters = inspect.signature(Muninn).parameters

    assert "client" not in parameters
    assert not hasattr(Muninn, "run")


@pytest.mark.parametrize("relative_path", RETIRED_HARNESS_ROUTES)
def test_obsolete_muninn_harness_routes_remain_absent(relative_path: str) -> None:
    assert not (PROJECT_ROOT / relative_path).exists()
