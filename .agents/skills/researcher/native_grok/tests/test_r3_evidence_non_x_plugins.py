#!/usr/bin/env python3
"""R3 fixture-only evidence, redaction, citation, and corroboration checks."""
from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))

from corroboration import CorroborationError, corroborate_evidence, dedupe_with_stats  # noqa: E402
from evidence import EvidenceError, canonical_bytes, make_citation, normalize_fixture_records, validate_citation, validate_evidence  # noqa: E402
from proposals import ProposalError, make_abstention, make_proposal, validate_abstention, validate_proposal  # noqa: E402
from redaction import RedactionRequired, contains_sensitive_material, redact_payload  # noqa: E402


def digest(value: object) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def load_fixture() -> dict:
    raw = (BASE / "tests" / "r3_non_x_source_records.v1.json").read_bytes()
    value = json.loads(raw.decode("utf-8"))
    assert raw == canonical_bytes(value), "fixture is not canonical JSON"
    assert value["schema"] == "researcher.r3.non_x_source_records.v1"
    return value


def boolean_schema_values() -> dict[str, bool]:
    values: dict[str, bool] = {}
    for path in (BASE / "schemas").glob("*.schema.json"):
        schema = json.loads(path.read_text(encoding="utf-8"))

        def visit(node: object) -> None:
            if isinstance(node, dict):
                if node.get("type") == "boolean":
                    return
                for key, child in node.items():
                    if key == "properties" and isinstance(child, dict):
                        for prop, spec in child.items():
                            if isinstance(spec, dict) and spec.get("type") == "boolean":
                                values[prop] = False
                            visit(spec)
                    else:
                        visit(child)
            elif isinstance(node, list):
                for child in node:
                    visit(child)

        visit(schema)
    return values


def main() -> int:
    fixture = load_fixture()
    bool_metadata = boolean_schema_values()
    assert bool_metadata and not contains_sensitive_material(bool_metadata), "boolean metadata false-positive"

    records = normalize_fixture_records(fixture["records"])
    assert len(records) == 3
    for record in records:
        assert validate_evidence(record)
    citations = [make_citation(record, locator_fragment="bounded fixture observation") for record in records]
    for citation, record in zip(citations, records):
        assert validate_citation(citation, record)

    stats = dedupe_with_stats(records)
    assert stats["input_count"] == 3 and stats["unique_count"] == 2 and stats["duplicate_count"] == 1
    corroboration = corroborate_evidence(records)
    assert corroboration["status"] == "PASS"
    assert corroboration["independent_source_groups"] == ["independent", "official"]
    try:
        corroborate_evidence([records[0], records[1]])
    except CorroborationError:
        raise AssertionError("diagnostic API must return typed insufficient result")
    assert corroborate_evidence([records[0], records[1]])["code"] == "CORROBORATION_INSUFFICIENT"
    try:
        from corroboration import require_independent_corroboration
        require_independent_corroboration([records[0], records[1]])
    except CorroborationError as error:
        assert error.code == "CORROBORATION_INSUFFICIENT"
    else:
        raise AssertionError("independent-source requirement accepted one source group")

    proposal = make_proposal(stats["records"], [citations[0], citations[2]], bead_id="bead-r3", set_id="set-r3", decision_id="decision-r3")
    assert validate_proposal(proposal)
    replay_hashes = {digest(copy.deepcopy(proposal)) for _ in range(100)}
    assert len(replay_hashes) == 1
    malformed = copy.deepcopy(proposal); malformed["execution_allowed"] = True
    try:
        validate_proposal(malformed)
    except ProposalError:
        pass
    else:
        raise AssertionError("execution-enabled proposal accepted")

    secret = {"record_id": "fixture-secret", "secret": "do-not-store"}
    assert contains_sensitive_material(secret)
    assert "secret" not in redact_payload(secret)
    try:
        normalize_fixture_records([secret])
    except RedactionRequired as error:
        assert error.code == "REDACTION_REQUIRED"
        abstention = make_abstention(bead_id="bead-r3", set_id="set-r3", decision_id="decision-r3", plugin_id="fixture.local", code="REDACTION_REQUIRED", stage="redaction", reason="Fixture contains secret-bearing material.", abstention_id="abstention-secret")
        assert validate_abstention(abstention)
    else:
        raise AssertionError("secret-bearing fixture was accepted")

    unknown = {"record_id": "fixture-unknown", "unexpected": "field"}
    try:
        normalize_fixture_records([unknown])
    except EvidenceError as error:
        assert error.code == "UNKNOWN_FIELD"
    else:
        raise AssertionError("unknown source field was accepted")

    raw_content = {"record_id": "fixture-raw", "content": "raw source body"}
    try:
        normalize_fixture_records([raw_content])
    except RedactionRequired as error:
        assert error.code == "REDACTION_REQUIRED"
    else:
        raise AssertionError("raw content was accepted")

    print(json.dumps({
        "adversarial_fixtures": "ALL_PASS", "boolean_metadata_false_positive": "PASS",
        "citation_binding": "PASS", "deterministic_replay_mismatches": 0,
        "deterministic_replay_pairs": 100, "dedupe_unique": stats["unique_count"],
        "independent_source_rules": "PASS", "raw_or_secret_leakage": 0,
        "status": "PASS", "tests_failed": 0, "typed_abstention": "PASS",
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, EvidenceError, ProposalError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"defect": str(error), "status": "FAIL"}, sort_keys=True))
        raise SystemExit(1)
