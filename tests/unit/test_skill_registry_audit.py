from pathlib import Path

from scripts.audit_skill_registry import build_registry_manifest, normalize_skill_name


def test_normalize_skill_name_canonicalizes_variants() -> None:
    assert normalize_skill_name("Visual-Explainer") == "visualexplainer"
    assert normalize_skill_name("KnowledgeHunter") == "knowledgehunter"


def test_registry_manifest_declares_agents_skills_authoritative() -> None:
    manifest = build_registry_manifest()

    assert manifest["authoritative_root"] == ".agents/skills"
    assert "chant" in manifest["skills"]
    assert "autobot" in manifest["skills"]
    assert manifest["skills"]["chant"]["source"] == ".agents/skills"
    assert manifest["skills"]["autobot"]["source"] == ".agents/skills"

    local_entries = [entry for entry in manifest["skills"].values() if entry["source"] != ".agents/skills"]
    assert any(entry["migration_status"] in {"wrap", "migrate", "bootstrap-only", "retire"} for entry in local_entries)
