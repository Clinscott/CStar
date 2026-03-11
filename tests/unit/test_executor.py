import json

from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.executor import SovereignExecutor


def test_suggest_forge_captures_triage_bead_instead_of_forging(tmp_path):
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    executor = SovereignExecutor(tmp_path, tmp_path)
    executor.suggest_forge("build a better scan planner")

    beads = BeadLedger(tmp_path).list_beads()
    assert len(beads) == 1
    bead = beads[0]
    assert bead.status == "NEEDS_TRIAGE"
    assert bead.triage_reason is not None
    assert "Freeform forge bypass retired" in bead.triage_reason
    assert "build a better scan planner" in bead.rationale
