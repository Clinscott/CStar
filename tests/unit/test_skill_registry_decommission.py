from pathlib import Path

import pytest

from scripts import audit_skill_registry


def test_decommissioned_skill_directories_are_not_authority(
    monkeypatch,
    tmp_path: Path,
) -> None:
    authority_root = tmp_path / "skills"
    active = authority_root / "active-skill"
    retired = authority_root / "autobot"
    active.mkdir(parents=True)
    retired.mkdir()
    (active / "SKILL.md").write_text("# active\n", encoding="utf-8")
    (retired / "SKILL.md").write_text("# historical\n", encoding="utf-8")
    (retired / audit_skill_registry.DECOMMISSION_MARKER).write_text(
        "# retired\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(audit_skill_registry, "AUTHORITY_ROOT", authority_root)

    authority = audit_skill_registry.load_authoritative_skills()

    assert "activeskill" in authority
    assert "autobot" not in authority


def test_decommissioned_local_skill_directories_are_not_migration_candidates(
    monkeypatch,
    tmp_path: Path,
) -> None:
    authority_root = tmp_path / "skills"
    local_root = tmp_path / "local"
    authority_root.mkdir()
    local_root.mkdir()

    active = local_root / "active-helper"
    retired = local_root / "WildHunt"
    active.mkdir()
    retired.mkdir()
    (active / "helper.py").write_text("# active\n", encoding="utf-8")
    (retired / "wild_hunt.py").write_text("# tombstone\n", encoding="utf-8")
    (retired / audit_skill_registry.DECOMMISSION_MARKER).write_text(
        "# retired\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(audit_skill_registry, "AUTHORITY_ROOT", authority_root)
    monkeypatch.setattr(audit_skill_registry, "LOCAL_ROOT", local_root)

    local = audit_skill_registry.load_local_skills({})

    assert [entry["name"] for entry in local] == ["active-helper"]


def test_registry_build_rejects_stale_entries_for_decommissioned_skills(
    monkeypatch,
    tmp_path: Path,
) -> None:
    authority_root = tmp_path / "skills"
    retired = authority_root / "autobot"
    retired.mkdir(parents=True)
    (retired / audit_skill_registry.DECOMMISSION_MARKER).write_text(
        "# retired\n",
        encoding="utf-8",
    )
    manifest_path = tmp_path / "skill_registry.json"
    manifest_path.write_text(
        '{"entries":{"autobot":{"tier":"SKILL"},"hall":{"tier":"PRIME"}}}',
        encoding="utf-8",
    )
    local_root = tmp_path / "local"
    spell_root = tmp_path / "spells"
    test_root = tmp_path / "tests"
    local_root.mkdir()
    spell_root.mkdir()
    test_root.mkdir()
    monkeypatch.setattr(audit_skill_registry, "AUTHORITY_ROOT", authority_root)
    monkeypatch.setattr(audit_skill_registry, "MANIFEST_PATH", manifest_path)
    monkeypatch.setattr(audit_skill_registry, "LOCAL_ROOT", local_root)
    monkeypatch.setattr(audit_skill_registry, "SPELL_ROOT", spell_root)
    monkeypatch.setattr(audit_skill_registry, "TEST_ROOT", test_root)

    with pytest.raises(
        audit_skill_registry.SkillRegistrySchemaError,
        match="decommissioned skills remain in the authoritative registry: autobot",
    ):
        audit_skill_registry.build_registry_manifest()


def test_check_mode_preserves_registry_and_does_not_write_report(
    monkeypatch,
    tmp_path: Path,
) -> None:
    authority_root = tmp_path / "skills"
    local_root = tmp_path / "local"
    spell_root = tmp_path / "spells"
    test_root = tmp_path / "tests"
    for root in (authority_root, local_root, spell_root, test_root):
        root.mkdir()
    manifest_path = tmp_path / "skill_registry.json"
    report_path = tmp_path / "report.qmd"
    original = '{"version":"2.0","entries":{"mimir-harvester":{"id":"mimir-harvester"}}}\n'
    manifest_path.write_text(original, encoding="utf-8")

    monkeypatch.setattr(audit_skill_registry, "AUTHORITY_ROOT", authority_root)
    monkeypatch.setattr(audit_skill_registry, "LOCAL_ROOT", local_root)
    monkeypatch.setattr(audit_skill_registry, "SPELL_ROOT", spell_root)
    monkeypatch.setattr(audit_skill_registry, "TEST_ROOT", test_root)
    monkeypatch.setattr(audit_skill_registry, "MANIFEST_PATH", manifest_path)
    monkeypatch.setattr(audit_skill_registry, "REPORT_PATH", report_path)
    monkeypatch.setattr("sys.argv", ["audit_skill_registry.py", "--check"])

    audit_skill_registry.main()

    assert manifest_path.read_text(encoding="utf-8") == original
    assert not report_path.exists()
