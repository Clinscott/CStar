"""Retirement contracts for the legacy Python Ravens execution family."""

from contextlib import ExitStack
from unittest.mock import patch

import pytest

from src.core.engine.ravens.muninn import Muninn
from src.core.engine.ravens.muninn_crucible import MuninnCrucible
from src.core.engine.ravens.muninn_heart import MuninnHeart
from src.core.engine.wardens.edda import EddaWarden
from src.core.engine.wardens.norn import NornWarden


RAVENS_ERROR = "legacy_python_ravens_engine_retired_use_cstar_kernel"
AUTONOMOUS_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


@pytest.mark.parametrize(
    ("invoke", "error"),
    [
        (lambda: Muninn("synthetic"), RAVENS_ERROR),
        (lambda: MuninnCrucible("synthetic", object()), RAVENS_ERROR),
        (lambda: MuninnHeart("synthetic", object()), RAVENS_ERROR),
        (lambda: NornWarden("synthetic"), AUTONOMOUS_ERROR),
        (lambda: EddaWarden("synthetic"), AUTONOMOUS_ERROR),
    ],
)
def test_legacy_execution_contract_fails_before_effects(invoke, error):
    with ExitStack() as stack:
        probes = [
            stack.enter_context(patch(target))
            for target in (
                "builtins.open",
                "pathlib.Path.read_text",
                "pathlib.Path.write_text",
                "pathlib.Path.mkdir",
                "pathlib.Path.rglob",
                "subprocess.run",
                "sqlite3.connect",
                "socket.socket",
                "os.putenv",
            )
        ]
        with pytest.raises(RuntimeError, match=f"^{error}$"):
            invoke()

    for probe in probes:
        probe.assert_not_called()
