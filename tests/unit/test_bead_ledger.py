import pytest

from src.core.engine.bead_ledger import (
    LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR,
    BeadLedger,
    SovereignBead,
)


def test_detached_bead_schema_remains_available():
    bead = SovereignBead(
        id="bead:synthetic",
        repo_id="repo:test",
        scan_id="scan:test",
        rationale="Synthetic schema proof",
        created_at=1,
        updated_at=1,
        target_path="src/example.py",
        contract_refs=["contract:synthetic"],
        acceptance_criteria="No effects.",
    )
    assert bead.to_public_dict()["actionable"] is True
    assert BeadLedger.has_executable_contract_refs(bead.contract_refs) is True


@pytest.mark.parametrize(
    "method",
    [
        "connect",
        "list_beads",
        "peek_next_bead",
        "claim_next_bead",
        "claim_bead",
        "mark_ready_for_review",
        "block_bead",
        "resolve_bead",
        "get_bead",
        "upsert_bead",
        "sync_tasks_projection",
    ],
)
def test_direct_bead_lifecycle_methods_fail_closed(method):
    ledger = object.__new__(BeadLedger)
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        getattr(ledger, method)()
