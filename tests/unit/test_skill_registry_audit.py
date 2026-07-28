from __future__ import annotations

import json

import pytest

import scripts.audit_skill_registry as registry_audit
from scripts.audit_skill_registry import infer_entrypoint_path, require_registry_entry_map


def test_registry_entry_validator_preserves_keyed_entries() -> None:
    entries = {
        "mimir-harvester": {"id": "mimir-harvester"},
        "autobot": {"id": "autobot"},
    }

    assert require_registry_entry_map(entries) is entries


@pytest.mark.parametrize(
    "malformed",
    [
        [{"id": "autobot"}],
        {"autobot": []},
        {"autobot": None},
        {"": {}},
    ],
)
def test_registry_entry_validator_rejects_malformed_shapes(malformed: object) -> None:
    with pytest.raises(ValueError, match="skill registry"):
        require_registry_entry_map(malformed)


def test_audit_loader_does_not_discard_array_entries(tmp_path, monkeypatch) -> None:
    manifest_path = tmp_path / "skill_registry.json"
    original = {
        "version": "2.0",
        "entries": [{"id": "autobot"}],
    }
    manifest_path.write_text(json.dumps(original), encoding="utf-8")
    monkeypatch.setattr(registry_audit, "MANIFEST_PATH", manifest_path)

    with pytest.raises(ValueError, match="must be an object"):
        registry_audit.load_existing_registry()

    assert json.loads(manifest_path.read_text(encoding="utf-8")) == original


def test_registry_audit_preserves_declared_typescript_entrypoint() -> None:
    assert infer_entrypoint_path(
        "calculus",
        ".agents/skills/calculus",
        {"entrypoint_path": "src/node/core/runtime/adapters/calculus.ts"},
    ) == "src/node/core/runtime/adapters/calculus.ts"
