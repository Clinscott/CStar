from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

import pytest

from src.core.engine.memory_db import MemoryDB
from src.core.engine.utils.sandbox_warden import SandboxWarden
from src.core.engine.utils.stability import GungnirValidator, TheWatcher
from src.core.engine.validation_result import (
    create_validation_result,
    save_validation_result,
)


def test_pure_sprt_calculus_remains_available() -> None:
    validator = GungnirValidator(p0=0.01, p1=0.2)
    for _ in range(100):
        validator.record_trial(success=True)
    assert validator.status == "ACCEPT"


@pytest.mark.parametrize(
    ("invoke", "error"),
    [
        (
            lambda: save_validation_result(
                "/synthetic/root",
                create_validation_result(summary="synthetic"),
            ),
            "legacy_python_validation_persistence_retired_use_cstar_record_result",
        ),
        (
            lambda: TheWatcher(Path("/synthetic/root")),
            "legacy_python_stability_watcher_retired_use_cstar_kernel",
        ),
        (
            lambda: SandboxWarden().run_in_sandbox(Path("/synthetic/input.py")),
            "legacy_python_sandbox_warden_retired_use_supported_sandbox",
        ),
        (
            lambda: MemoryDB("/synthetic/root").get_hall_of_records(),
            "legacy_python_memory_authority_retired_use_cstar_kernel",
        ),
    ],
)
def test_retired_residual_actions_fail_before_external_effects(invoke, error) -> None:
    with ExitStack() as stack:
        probes = [
            stack.enter_context(patch(target))
            for target in (
                "builtins.open",
                "pathlib.Path.exists",
                "pathlib.Path.read_text",
                "pathlib.Path.write_text",
                "pathlib.Path.mkdir",
                "pathlib.Path.rglob",
                "pathlib.Path.resolve",
                "subprocess.run",
                "subprocess.Popen",
                "sqlite3.connect",
                "socket.socket",
                "os.system",
            )
        ]

        with pytest.raises(RuntimeError, match=f"^{error}$"):
            invoke()

    for probe in probes:
        probe.assert_not_called()


def test_residual_sources_do_not_embed_retired_effect_providers() -> None:
    root = Path(__file__).resolve().parents[2]
    forbidden_by_source = {
        "src/core/engine/validation_result.py": ("HallOfRecords",),
        "src/core/engine/utils/stability.py": (
            "HallOfRecords",
            ".read_text(",
            ".write_text(",
            ".rglob(",
        ),
        "src/core/engine/utils/sandbox_warden.py": (
            "import subprocess",
            "subprocess.",
            '"docker"',
        ),
        "src/core/engine/memory_db.py": (
            "chromadb",
            "HallOfRecords",
            "PersistentClient",
        ),
        "src/core/engine/vector_shadow.py": ("Chroma", "PersistentClient"),
    }

    for relative, forbidden in forbidden_by_source.items():
        source = (root / relative).read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in source, (relative, token)
