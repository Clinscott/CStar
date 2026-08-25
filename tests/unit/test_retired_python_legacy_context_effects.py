from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

import pytest

from src.core.engine.bifrost import SkillForge
from src.core.engine.context import SovereignContext, parse_feedback_context
from src.core.engine.cortex import Cortex, parse_cortex_sections
from src.core.engine.memory_db import MemoryDB
from src.core.engine.vector_ingest import VectorIngest


def test_pure_context_helpers_use_only_explicit_inputs() -> None:
    assert parse_feedback_context(
        [
            '{"score": 1, "target_file": "src/a.py"}',
            '{"score": 5, "target_file": "src/b.py"}',
            "invalid",
            '{"score": 1, "target_file": "src/a.py"}',
        ]
    ) == ["src/a.py"]
    assert parse_cortex_sections("Rules", "# Gates\nPreserve them.") == [
        ("Rules > Gates", "Preserve them.")
    ]


@pytest.mark.parametrize(
    ("invoke", "error"),
    [
        (
            lambda: SovereignContext(Path("/synthetic/root")),
            "legacy_python_context_effect_surface_retired_use_cstar_kernel",
        ),
        (
            lambda: Cortex(Path("/synthetic/root"), Path("/synthetic/base")),
            "legacy_python_cortex_runtime_retired_use_bounded_cstar_hall_search",
        ),
        (
            lambda: SkillForge().record_failure("query", 0.5),
            "legacy_python_skill_forge_effect_retired_use_cstar_forge",
        ),
        (
            lambda: SkillForge().synthesize_bridge(["query"]),
            "legacy_python_skill_forge_effect_retired_use_cstar_forge",
        ),
        (
            lambda: VectorIngest(MemoryDB("/synthetic/root")).load_skills_from_dir(
                "/synthetic/skills"
            ),
            "legacy_python_skill_directory_scan_retired_use_cstar_skill_registry",
        ),
    ],
)
def test_legacy_context_effects_fail_before_external_actions(invoke, error) -> None:
    with ExitStack() as stack:
        probes = [
            stack.enter_context(patch(target))
            for target in (
                "builtins.open",
                "pathlib.Path.exists",
                "pathlib.Path.open",
                "pathlib.Path.read_text",
                "pathlib.Path.write_text",
                "pathlib.Path.mkdir",
                "pathlib.Path.glob",
                "pathlib.Path.rglob",
                "pathlib.Path.stat",
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


def test_legacy_context_sources_contain_no_retired_effect_implementation() -> None:
    root = Path(__file__).resolve().parents[2]
    forbidden_by_source = {
        "src/core/engine/context.py": (
            "TraceCompiler",
            "SovereignHUD",
            ".open(",
            "gc.collect",
        ),
        "src/core/engine/cortex.py": (
            "SovereignVector",
            ".exists(",
            ".read_text(",
            ".stat(",
            "asyncio",
        ),
        "src/core/engine/bifrost.py": (
            "SovereignVector",
            "open(",
            ".write(",
        ),
        "src/core/engine/vector_ingest.py": (
            ".exists(",
            ".glob(",
            ".read_text(",
            ".is_file(",
        ),
        "src/core/engine/builder.py": (
            "InstructionLoader",
            "SovereignVector",
            ".exists(",
        ),
    }

    for relative, forbidden in forbidden_by_source.items():
        source = (root / relative).read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in source, (relative, token)
