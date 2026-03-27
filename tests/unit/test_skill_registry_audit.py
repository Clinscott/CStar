from pathlib import Path

from scripts.audit_skill_registry import build_registry_manifest, normalize_skill_name


def test_normalize_skill_name_canonicalizes_variants() -> None:
    assert normalize_skill_name("Visual-Explainer") == "visualexplainer"
    assert normalize_skill_name("KnowledgeHunter") == "knowledgehunter"


def test_registry_manifest_declares_agents_skills_authoritative() -> None:
    manifest = build_registry_manifest()

    assert manifest["authority_audit"]["authoritative_root"] == ".agents/skills"
    assert "chant" in manifest["entries"]
    assert "autobot" in manifest["entries"]
    assert manifest["entries"]["chant"]["instruction_path"] == ".agents/skills/chant/SKILL.md"
    assert manifest["entries"]["autobot"]["instruction_path"] == ".agents/skills/autobot/SKILL.md"

    local_entries = manifest["authority_audit"]["local_candidates"]
    assert any(entry["migration_status"] in {"wrap", "migrate", "bootstrap-only", "retire"} for entry in local_entries)


def test_active_entries_gain_authority_fields() -> None:
    manifest = build_registry_manifest()

    hall = manifest["entries"]["hall"]
    chant = manifest["entries"]["chant"]
    silver_shield = manifest["entries"]["silver_shield"]

    assert hall["authority_path"] == ".agents/skills/hall"
    assert hall["owner_runtime"] == "host-agent"
    assert hall["host_support"]["gemini"] == "native-session"
    assert hall["host_support"]["codex"] == "exec-bridge"
    assert hall["recursion_policy"] == "leaf"
    assert hall["contracts"] == [".agents/skills/hall/SKILL.md"]

    assert chant["authority_path"] == ".agents/skills/chant"
    assert chant["owner_runtime"] == "cstar-kernel"
    assert chant["host_support"]["codex"] == "supported"
    assert chant["recursion_policy"] == "bounded-orchestrator"
    assert ".agents/skills/chant/chant.feature" in chant["contracts"]

    assert silver_shield["authority_path"] == ".agents/spells/silver_shield.md"
    assert silver_shield["owner_runtime"] == "policy-layer"
    assert silver_shield["spell_classification"] == "policy-only"
    assert silver_shield["host_support"]["codex"] == "policy-only"
    assert silver_shield["recursion_policy"] == "policy-only"
    assert "tests/unit/test_heimdall_shield_empire.py" in silver_shield["tests"]


def test_audit_demotes_archive_and_requires_zero_active_authority_issues() -> None:
    manifest = build_registry_manifest()

    archive_entry = manifest["entries"]["_archive"]
    assert archive_entry["viability"] == "DEPRECATED"
    assert manifest["authority_audit"]["authority_issues"] == []
