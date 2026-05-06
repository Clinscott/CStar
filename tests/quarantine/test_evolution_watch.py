from __future__ import annotations

import importlib.util
from pathlib import Path


CSTAR_ROOT = Path(__file__).resolve().parents[2]
EVOLUTION_WATCH = CSTAR_ROOT / "src" / "skills" / "local" / "CStarEvolutionWatch" / "scripts" / "evolution_watch.py"


def load_evolution_watch():
    spec = importlib.util.spec_from_file_location("evolution_watch", EVOLUTION_WATCH)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_evolution_watch_does_not_emit_resolved_p1_findings():
    module = load_evolution_watch()

    findings = {finding.id: finding for finding in module.inspect_cstar()}

    assert "f01" not in findings
    assert "f08" not in findings
    assert "f09" not in findings


def test_evolution_watch_suppresses_currently_resolved_stale_findings():
    module = load_evolution_watch()

    findings = {finding.id: finding for finding in module.inspect_cstar()}

    assert "f06" not in findings
    assert "f07" not in findings
    assert "f11" not in findings


def test_evolution_watch_suppresses_resolved_ravens_gap():
    module = load_evolution_watch()

    findings = {finding.id: finding for finding in module.inspect_cstar()}

    assert "f05" not in findings


# Tests removed: verify_current_state was removed from evolution_watch.py
# in commit ca6f1405. The remaining tests cover the active inspect_cstar() API.
