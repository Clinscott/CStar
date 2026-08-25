from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import audit_skill_registry


def _set_manifest_path(monkeypatch: pytest.MonkeyPatch, path: Path) -> None:
    monkeypatch.setattr(audit_skill_registry, "MANIFEST_PATH", path)


def test_array_entries_fail_closed_without_rewriting_registry(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    manifest_path = tmp_path / "skill_registry.json"
    original = '{"version":"3.0","entries":[{"id":"cstar-closeout"}]}\n'
    manifest_path.write_text(original, encoding="utf-8")
    _set_manifest_path(monkeypatch, manifest_path)

    with pytest.raises(
        audit_skill_registry.SkillRegistrySchemaError,
        match="entries must be a non-null JSON object keyed by capability id; got list",
    ):
        audit_skill_registry.load_existing_registry()

    assert manifest_path.read_text(encoding="utf-8") == original


def test_valid_keyed_closeout_entry_is_preserved(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    manifest_path = tmp_path / "skill_registry.json"
    manifest = {
        "version": "2.0",
        "entries": {
            "cstar-closeout": {
                "id": "cstar-closeout",
                "tier": "SKILL",
                "execution": {"adapter": "weave:distill-lessons"},
            }
        },
    }
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    _set_manifest_path(monkeypatch, manifest_path)

    loaded = audit_skill_registry.load_existing_registry()

    assert loaded == manifest
    assert list(loaded["entries"]) == ["cstar-closeout"]


@pytest.mark.parametrize("embedded_id", ["different-capability", None, 42])
def test_entry_key_and_embedded_id_must_match(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    embedded_id: object,
) -> None:
    manifest_path = tmp_path / "skill_registry.json"
    manifest_path.write_text(
        json.dumps(
            {
                "entries": {
                    "cstar-closeout": {"id": embedded_id},
                }
            }
        ),
        encoding="utf-8",
    )
    _set_manifest_path(monkeypatch, manifest_path)

    with pytest.raises(
        audit_skill_registry.SkillRegistrySchemaError,
        match="entry 'cstar-closeout' has mismatched embedded id",
    ):
        audit_skill_registry.load_existing_registry()


@pytest.mark.parametrize(
    ("entries", "message"),
    [
        (None, "entries must be a non-null JSON object"),
        ({" ": {}}, "entry keys must be non-blank strings"),
        ({"cstar-closeout": None}, "entry 'cstar-closeout' must be a JSON object"),
    ],
)
def test_other_malformed_entry_shapes_fail_closed(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    entries: object,
    message: str,
) -> None:
    manifest_path = tmp_path / "skill_registry.json"
    manifest_path.write_text(json.dumps({"entries": entries}), encoding="utf-8")
    _set_manifest_path(monkeypatch, manifest_path)

    with pytest.raises(audit_skill_registry.SkillRegistrySchemaError, match=message):
        audit_skill_registry.load_existing_registry()


def test_existing_registry_requires_entries_field(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    manifest_path = tmp_path / "skill_registry.json"
    manifest_path.write_text('{"version":"2.0"}', encoding="utf-8")
    _set_manifest_path(monkeypatch, manifest_path)

    with pytest.raises(
        audit_skill_registry.SkillRegistrySchemaError,
        match="entries field is required",
    ):
        audit_skill_registry.load_existing_registry()


def test_missing_registry_retains_empty_keyed_default(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    manifest_path = tmp_path / "missing-skill-registry.json"
    _set_manifest_path(monkeypatch, manifest_path)

    loaded = audit_skill_registry.load_existing_registry()

    assert loaded["entries"] == {}
