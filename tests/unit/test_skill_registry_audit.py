from __future__ import annotations

import json

import pytest

import scripts.audit_skill_registry as registry_audit
from scripts.audit_skill_registry import (
    build_registry_manifest,
    infer_entrypoint_path,
    require_registry_entry_map,
)


def test_registry_validator_preserves_canonical_entries() -> None:
    entries = {
        "calculus": {
            "id": "calculus",
            "instruction_path": ".agents/skills/calculus/SKILL.md",
        },
    }
    assert require_registry_entry_map(entries) is entries


@pytest.mark.parametrize(
    "malformed",
    [
        [{"id": "calculus"}],
        {"calculus": []},
        {"calculus": None},
        {"": {}},
        {"Calculus": {}},
        {"../calculus": {}},
        {"calculus": {"id": "other"}},
        {"calculus": {"instruction_path": "../escape.md"}},
        {"calculus": {"entrypoint_path": "/tmp/escape.ts"}},
        {"calculus": {"tests": ["tests/unit/ok.ts", "../escape.ts"]}},
    ],
)
def test_registry_validator_rejects_malformed_or_unsafe_entries(malformed: object) -> None:
    with pytest.raises(ValueError, match="skill registry"):
        require_registry_entry_map(malformed)


def test_loader_rejects_duplicate_json_keys_without_rewriting(tmp_path, monkeypatch) -> None:
    manifest_path = tmp_path / "skill_registry.json"
    raw = '{"entries":{"calculus":{"id":"calculus"},"calculus":{"id":"calculus"}}}'
    manifest_path.write_text(raw, encoding="utf-8")
    monkeypatch.setattr(registry_audit, "MANIFEST_PATH", manifest_path)

    with pytest.raises(ValueError, match="duplicate JSON key"):
        registry_audit.load_existing_registry()

    assert manifest_path.read_text(encoding="utf-8") == raw


def test_loader_rejects_array_entries_without_discarding_source(tmp_path, monkeypatch) -> None:
    manifest_path = tmp_path / "skill_registry.json"
    original = {"version": "3.0", "entries": [{"id": "calculus"}]}
    manifest_path.write_text(json.dumps(original), encoding="utf-8")
    monkeypatch.setattr(registry_audit, "MANIFEST_PATH", manifest_path)

    with pytest.raises(ValueError, match="must be an object"):
        registry_audit.load_existing_registry()

    assert json.loads(manifest_path.read_text(encoding="utf-8")) == original


def test_audit_preserves_declared_typescript_entrypoint() -> None:
    assert infer_entrypoint_path(
        "calculus",
        ".agents/skills/calculus",
        {"entrypoint_path": "src/node/core/runtime/adapters/calculus.ts"},
    ) == "src/node/core/runtime/adapters/calculus.ts"


def test_built_manifest_remains_canonical() -> None:
    entries = build_registry_manifest()["entries"]
    assert require_registry_entry_map(entries) is entries
