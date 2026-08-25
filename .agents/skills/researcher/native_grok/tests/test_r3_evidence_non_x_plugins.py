#!/usr/bin/env python3
"""Focused R3 evidence-integrity, fixture, and adversarial checks."""
from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))

from corroboration import (  # noqa: E402
    corroboration_report,
    deduplicate_evidence,
    require_independent_sources,
)
from evidence import (  # noqa: E402
    EvidenceError,
    FixtureSourceAdapter,
    build_evidence_receipt,
    make_abstention,
    normalize_source_record,
    validate_citation,
    validate_evidence_receipt,
)
from proposals import (  # noqa: E402
    build_proposal,
    build_terminal,
    replay_canonical,
    validate_proposal,
    validate_terminal,
)
from redaction import (  # noqa: E402
    RedactionError,
    assert_safe,
    contains_sensitive_material,
    redact_source_record,
    redact_text,
)


def load_fixture() -> dict:
    return json.loads((BASE / "tests" / "r3_non_x_source_records.v1.json").read_text(encoding="utf-8"))


def reject(callable_, code: str) -> None:
    try:
        callable_()
    except EvidenceError as exc:
        assert exc.code == code, (exc.code, code)
    except RedactionError as exc:
        assert exc.code == code, (exc.code, code)
    else:
        raise AssertionError("adversarial input was accepted")


def test_fixture_adapter_is_read_only_non_x() -> None:
    fixture = load_fixture()["records"]
    adapter = FixtureSourceAdapter(fixture, capability_id="fixture.local", source_group="fixture_local")
    normalized = adapter.read("evidence contract")
    assert len(normalized) == 3
    assert all(item["evidence"]["actual_identity"] == "unreported" for item in normalized)
    assert all(item["evidence"]["raw_source_included"] is False for item in normalized)
    assert all(item["evidence"]["credential_material_present"] is False for item in normalized)
    assert all("grok" not in json.dumps(item).lower() for item in normalized)


def test_normalization_provenance_and_citation_binding() -> None:
    record = load_fixture()["records"][0]
    normalized = normalize_source_record(record)
    evidence = validate_evidence_receipt(normalized["evidence"])
    citation = validate_citation(normalized["citation"], evidence)
    assert normalized["provenance"]["summary"]["state"] == "OBSERVED"
    assert normalized["provenance"]["summary"]["provenance"]["source_receipt_ref"] == evidence["source_receipt_ref"]
    tampered = copy.deepcopy(citation)
    tampered["evidence_id"] = "other-evidence"
    reject(lambda: validate_citation(tampered, evidence), "CITATION_INVALID")


def test_dedupe_and_independent_source_gate() -> None:
    evidence = [normalize_source_record(record)["evidence"] for record in load_fixture()["records"]]
    report = deduplicate_evidence(evidence, return_report=True)
    assert report["input_count"] == 3
    assert report["unique_count"] == 2
    assert report["duplicate_count"] == 1
    assert require_independent_sources(report["records"])["independent_source_count"] == 2
    assert corroboration_report(report["records"])["status"] == "PASS"
    same_group = [item for item in report["records"] if item["source_group"] == "official_docs"]
    assert corroboration_report(same_group)["status"] == "ABSTAINED"
    reject(lambda: require_independent_sources(same_group), "CORROBORATION_INSUFFICIENT")


def test_redaction_and_non_x_adversarial_fixtures() -> None:
    unsafe = load_fixture()["adversarial_records"][0]
    safe = redact_source_record(unsafe)
    assert not contains_sensitive_material(safe)
    assert "sk-test" not in json.dumps(safe)
    assert "<script>" not in json.dumps(safe).lower()
    assert_safe(safe)
    assert redact_text("Bearer sk-test-1234567890abcdef") == "[REDACTED]"
    reject(lambda: build_evidence_receipt(load_fixture()["adversarial_records"][1]), "CAPABILITY_PROFILE_UNSATISFIED")
    reject(lambda: build_evidence_receipt({**unsafe, "source_capability_id": "grok.x"}), "SOURCE_UNAVAILABLE")
    reject(lambda: build_evidence_receipt({**unsafe, "summary": "x" * 5000}), "REDACTION_REQUIRED")


def test_proposal_and_typed_abstention() -> None:
    evidence = [normalize_source_record(record)["evidence"] for record in load_fixture()["records"]]
    proposal = build_proposal(
        bead_id="bead:r3:evidence",
        decision_id="decision:r3:evidence",
        set_id="set:r3:evidence",
        evidence=evidence,
        observed_claims=[{
            "claim_id": "claim:contract",
            "evidence_refs": ["fixture-official-contract", "fixture-catalog-contract"],
            "state": "OBSERVED",
            "statement": "The fixture observations bind a versioned evidence contract.",
        }],
        require_corroboration=True,
    )
    assert validate_proposal(proposal)["execution_allowed"] is False
    abstention = make_abstention(
        code="SOURCE_UNAVAILABLE",
        stage="source",
        reason="The bounded fixture source is unavailable.",
    )
    assert abstention["execution_allowed"] is False
    assert abstention["abstention_sha256"] == hashlib.sha256(
        (json.dumps({key: value for key, value in abstention.items() if key != "abstention_sha256"}, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    ).hexdigest()


def test_deterministic_replay_and_terminal() -> None:
    evidence = [normalize_source_record(record)["evidence"] for record in load_fixture()["records"]]
    first = build_proposal(
        bead_id="bead:r3:evidence",
        decision_id="decision:r3:evidence",
        set_id="set:r3:evidence",
        evidence=evidence,
    )
    replay = replay_canonical(first, pairs=100)
    assert replay == {"pairs": 100, "mismatches": 0}
    terminal = build_terminal(
        bead_id="bead:r3:evidence",
        decision_id="decision:r3:evidence",
        set_id="set:r3:evidence",
        evidence_refs=first["evidence_refs"],
        proposal_ref=first["proposal_id"],
        replay_pairs=100,
        replay_mismatches=0,
    )
    assert validate_terminal(terminal)["terminal_sha256"] != "0" * 64
    tampered = copy.deepcopy(terminal)
    tampered["scope_counters"]["network_calls"] = 1
    reject(lambda: validate_terminal(tampered), "SCOPE_VIOLATION")


def main() -> int:
    tests = (
        test_fixture_adapter_is_read_only_non_x,
        test_normalization_provenance_and_citation_binding,
        test_dedupe_and_independent_source_gate,
        test_redaction_and_non_x_adversarial_fixtures,
        test_proposal_and_typed_abstention,
        test_deterministic_replay_and_terminal,
    )
    for test in tests:
        test()
    print(json.dumps({
        "status": "PASS",
        "tests_passed": len(tests),
        "tests_failed": 0,
        "fixture_only_sources": True,
        "grok_route_calls": 0,
        "provider_calls": 0,
        "network_calls": 0,
        "raw_or_secret_leakage": 0,
        "citation_binding": "PASS",
        "independent_source_rules": "PASS",
        "typed_abstention": "PASS",
        "adversarial_fixtures": "ALL_PASS",
        "deterministic_replay_pairs": 100,
        "deterministic_replay_mismatches": 0,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, EvidenceError, RedactionError, KeyError, TypeError, ValueError) as exc:
        print(json.dumps({"status": "FAIL", "defect": str(exc)}, sort_keys=True))
        raise SystemExit(1)
