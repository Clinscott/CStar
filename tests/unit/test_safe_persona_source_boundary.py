from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PRODUCTION_SUFFIXES = {".py", ".ts", ".js", ".mjs"}


def _production_sources() -> list[Path]:
    return [
        path
        for path in (ROOT / "src").rglob("*")
        if path.is_file()
        and path.suffix in PRODUCTION_SUFFIXES
        and "legacy_archive" not in path.parts
    ]


def test_no_production_source_names_or_constructs_the_secret_config_path() -> None:
    violations: list[str] = []
    segmented_path = re.compile(
        r"['\"]\.agents['\"]\s*(?:/|,)\s*['\"]config\.json['\"]"
    )
    split_construction = re.compile(
        r"(?:['\"]\.agents['\"].{0,300}['\"]config\.json['\"]|"
        r"['\"]config\.json['\"].{0,300}['\"]\.agents['\"])",
        re.DOTALL,
    )
    for path in _production_sources():
        source = path.read_text(encoding="utf-8", errors="replace")
        if (
            ".agents/config.json" in source
            or segmented_path.search(source)
            or split_construction.search(source)
        ):
            violations.append(str(path.relative_to(ROOT)))
    assert violations == []


def test_persona_advice_is_presentation_only() -> None:
    source = (ROOT / "src/core/persona_advice.ts").read_text(encoding="utf-8")
    forbidden = [
        "risk_tolerance",
        "execution_gate",
        "planning_stance",
        "investigation_stance",
        "repair_bias",
        "direction:",
    ]
    assert [token for token in forbidden if token in source] == []


def test_compatibility_docs_do_not_turn_persona_style_into_authority() -> None:
    source = (ROOT / "docs/integrations/CLAUDE.qmd").read_text(encoding="utf-8")
    assert "Do not ask for permission" not in source
    assert "MUST execute" not in source
    assert "Fix them" not in source
    assert "Persona affects presentation style" in source
    assert "No persona may initiate automatic repair" in source


def test_legacy_persona_and_dormancy_entrypoints_fail_closed() -> None:
    persona_source = (ROOT / "src/core/set_persona.py").read_text(encoding="utf-8")
    dormancy_source = (ROOT / "src/skills/local/dormancy.py").read_text(encoding="utf-8")
    assert "Direct persona mutation is retired" in persona_source
    assert "Legacy dormancy automation is retired" in dormancy_source
    assert "write_text" not in persona_source
    assert "write_text" not in dormancy_source
