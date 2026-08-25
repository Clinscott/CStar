from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_validation_evidence_contract_is_fail_closed() -> None:
    document = (
        ROOT / "docs/architecture/validation-evidence-contract.md"
    ).read_text(encoding="utf-8")
    feature = (
        ROOT / "tests/features/cstar_validation_evidence_gate.feature"
    ).read_text(encoding="utf-8")

    for phrase in (
        "Status: ACTIVE — FAIL CLOSED",
        "at least one evaluated validation check",
        "valid SHA-256 evidence digest",
        "Missing or zero-denominator evidence produces `INCONCLUSIVE`",
        "`cstar_record_result`",
        "`authority_class=reported`",
        "`cstar.validation-evidence.v2`",
        "Callers provide only bounded artifact/check paths and",
        "requester and",
        "authorizing executor",
        "Legacy v1",
        "one-use opaque kernel proof",
    ):
        assert phrase in document
    assert "Then the verdict is INCONCLUSIVE" in feature
    assert "And it is not ACCEPTED" in feature
    assert "caller-supplied identity or independence fields" in feature
    assert "replayed across Forge executions" in feature
