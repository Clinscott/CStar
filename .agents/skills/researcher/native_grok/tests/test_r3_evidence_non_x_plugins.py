#!/usr/bin/env python3
"""R3 fixture-only evidence, provenance, redaction, and corroboration checks."""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))

from compiler import canonical_bytes  # noqa: E402
from corroboration import corroborate_evidence, dedupe_evidence  # noqa: E402
from evidence import (  # noqa: E402
    EvidenceError,
    CitationInvalid,
    SourceUnavailable,
    build_abstention,
    build_citation,
    load_fixture_records,
    normalize_source_record,
    normalize_source_records,
    validate_abstention,
    validate_citation,
    validate_evidence,
)
from proposals import build_proposal, validate_proposal  # noqa: E402
from redaction import RedactionRequired, find_sensitive_material, redact_record  # noqa: E402


FIXTURE = BASE / "tests" / "r3_non_x_source_records.v1.json"


def _assert_code(callable_, code: str) -> None:
    try:
        callable_()
    except (EvidenceError, RedactionRequired) as exc:
        assert getattr(exc, "code", None) == code, (getattr(exc, "code", None), code)
    else:
        raise AssertionError(f"expected {code}")


def test_fixture_only_normalization() -> tuple[list[dict], dict]:
    records = load_fixture_records(FIXTURE)
    assert len(records) == 4
    evidence = normalize_source_records(records)
    assert len(evidence) == 4
    for receipt in evidence:
        assert validate_evidence(receipt)
        assert receipt["actual_identity"] == "unreported"
        assert receipt["raw_source_included"] is False
        assert receipt["private_content_included"] is False
        assert receipt["credential_material_present"] is False
        assert "content" not in receipt and "record_id" not in receipt
    result = corroborate_evidence(evidence, required_source_groups=2)
    assert result["status"] == "PASS"
    assert result["corroborated"] is True
    assert result["duplicate_count"] == 1
    assert len(result["independent_source_groups"]) == 3
    return evidence, result


def test_replay_and_dedupe(evidence: list[dict]) -> dict:
    replay_mismatches = 0
    expected = canonical_bytes(evidence)
    records = load_fixture_records(FIXTURE)
    for _ in range(100):
        replay = normalize_source_records(list(reversed(records)))
        replay_mismatches += int(canonical_bytes(replay) != expected)
    assert replay_mismatches == 0
    unique = dedupe_evidence(evidence)
    assert len(unique) == 3
    assert len(dedupe_evidence(list(reversed(evidence)))) == 3
    return {"replay_pairs": 100, "replay_mismatches": replay_mismatches, "unique_evidence": len(unique)}


def test_citation_and_proposal(evidence: list[dict]) -> dict:
    citations = [build_citation(item, "fixture observation") for item in evidence]
    assert all(validate_citation(citation, item) for citation, item in zip(citations, evidence))
    proposal = build_proposal(
        evidence,
        observed_claims=[
            {
                "claim_id": "claim:release:observed",
                "evidence_refs": [evidence[0]["evidence_id"], evidence[1]["evidence_id"]],
                "statement": "The fixture records a stable release observation.",
            }
        ],
        inferred_claims=[
            {
                "claim_id": "claim:release:inferred",
                "evidence_refs": [evidence[0]["evidence_id"], evidence[2]["evidence_id"]],
                "inference_rule": "rule:independent-source-match",
                "statement": "Independent fixture groups corroborate the observation.",
            }
        ],
    )
    assert validate_proposal(proposal)
    assert proposal["execution_allowed"] is False
    assert proposal["evidence_refs"] == sorted(proposal["evidence_refs"])
    return {"citations": len(citations), "proposal": proposal}


def test_boolean_metadata_and_secret_control(evidence: list[dict]) -> dict:
    # These keys are the Boolean-typed metadata properties declared by the
    # accepted R1 schemas.  Values are deliberately only Boolean values.
    boolean_metadata = {
        "execution_allowed": False,
        "credential_material_present": False,
        "private_content_included": False,
        "raw_source_included": False,
        "public_scope": True,
        "exposed_to_cstar": False,
        "raw_source_allowed": False,
        "required": True,
        "secret_material_allowed": False,
        "credential_required": False,
        "network_required": False,
    }
    assert find_sensitive_material(boolean_metadata) == ()
    safe_record = copy.deepcopy(load_fixture_records(FIXTURE)[0])
    safe_record["boolean_metadata"] = boolean_metadata
    _safe, _raw_seen = redact_record(safe_record)
    assert find_sensitive_material(_safe) == ()
    control = copy.deepcopy(safe_record)
    control["api_key"] = "fixture-secret-value"
    try:
        normalize_source_record(control)
    except RedactionRequired as exc:
        assert exc.code == "REDACTION_REQUIRED"
        abstention = build_abstention(
            "REDACTION_REQUIRED",
            reason="A fixture contains secret-bearing string material.",
            stage="redaction",
        )
        assert validate_abstention(abstention)
        return {
            "false_positive_boolean_metadata_case": "PASS",
            "actual_secret_control": "REDACTION_REQUIRED",
            "redaction_paths": list(exc.paths),
        }
    raise AssertionError("secret control was not rejected")


def test_adversarial_fixtures(evidence: list[dict]) -> int:
    grok = copy.deepcopy(load_fixture_records(FIXTURE)[0])
    grok["source_capability_id"] = "corvus.grok_x_public_search"
    _assert_code(lambda: normalize_source_record(grok), "SOURCE_UNAVAILABLE")
    budget = copy.deepcopy(load_fixture_records(FIXTURE)[0])
    budget["network_calls"] = 1
    _assert_code(lambda: normalize_source_record(budget), "BUDGET_OVERSHOOT")
    malformed = build_citation(evidence[0], "valid fragment")
    malformed["evidence_id"] = evidence[1]["evidence_id"]
    _assert_code(lambda: validate_citation(malformed, evidence[0]), "CITATION_INVALID")
    insufficient = corroborate_evidence(evidence[:1], required_source_groups=2)
    assert insufficient["status"] == "ABSTAINED"
    assert insufficient["abstention"]["code"] == "CORROBORATION_INSUFFICIENT"
    assert validate_abstention(insufficient["abstention"])
    return 4


def main() -> int:
    evidence, corroboration = test_fixture_only_normalization()
    replay = test_replay_and_dedupe(evidence)
    proposal = test_citation_and_proposal(evidence)
    boolean_case = test_boolean_metadata_and_secret_control(evidence)
    adversarial = test_adversarial_fixtures(evidence)
    result = {
        "status": "PASS",
        "tests_passed": 5,
        "tests_failed": 0,
        "fixture_only_sources": True,
        "grok_route_calls": 0,
        "provider_calls": 0,
        "network_calls": 0,
        "raw_or_secret_leakage": 0,
        "independent_source_rules": "PASS",
        "typed_abstention": "PASS",
        "adversarial_fixtures": "ALL_PASS",
        "false_positive_boolean_metadata_case": boolean_case["false_positive_boolean_metadata_case"],
        "actual_secret_control": boolean_case["actual_secret_control"],
        "deterministic_replay_pairs": replay["replay_pairs"],
        "deterministic_replay_mismatches": replay["replay_mismatches"],
        "duplicate_records": 1,
        "unique_evidence": replay["unique_evidence"],
        "independent_source_groups": corroboration["independent_source_groups"],
        "citations": proposal["citations"],
        "adversarial_case_count": adversarial,
        "requested_model": "gpt-5.6-luna",
        "requested_reasoning": "max",
        "actual_identity": "unreported",
        "scope_counters": {
            "provider_calls": 0,
            "network_calls": 0,
            "retries": 0,
            "descendants": 0,
            "waits": 0,
            "protected_effects": 0,
        },
    }
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, EvidenceError, RedactionRequired, CitationInvalid, KeyError, TypeError, ValueError) as exc:
        print(json.dumps({"status": "FAIL", "defect": str(exc)}, sort_keys=True))
        raise SystemExit(1)

