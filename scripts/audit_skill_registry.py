from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
AUTHORITY_ROOT = PROJECT_ROOT / ".agents" / "skills"
LOCAL_ROOT = PROJECT_ROOT / "src" / "skills" / "local"
MANIFEST_PATH = PROJECT_ROOT / ".agents" / "skill_registry.json"
REPORT_PATH = PROJECT_ROOT / "docs" / "reports" / "SKILL_AUTHORITY_REPORT.qmd"

ALIAS_MAP = {
    "cachebro": "cachebro",
    "knowledgehunter": "hunt",
    "oracle": "oracle",
    "personaaudit": "persona",
    "skilllearning": "evolve",
    "visualexplainer": "visual-explainer",
}


def normalize_skill_name(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def relative_to_project(path: Path | None) -> str | None:
    if path is None:
        return None
    try:
        return path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def find_entrypoint(skill_dir: Path) -> Path | None:
    scripts_dir = skill_dir / "scripts"
    candidates = [
        scripts_dir / f"{skill_dir.name}.py",
        skill_dir / f"{skill_dir.name}.py",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def find_contract(skill_dir: Path) -> Path | None:
    candidates = [
        skill_dir / "contract.json",
        skill_dir / f"{skill_dir.name}.feature",
        skill_dir / "SKILL.md",
        skill_dir / "SKILL.qmd",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def load_authoritative_skills() -> dict[str, dict[str, Any]]:
    authority: dict[str, dict[str, Any]] = {}
    if not AUTHORITY_ROOT.exists():
        return authority

    for skill_dir in sorted(path for path in AUTHORITY_ROOT.iterdir() if path.is_dir() and not path.name.startswith(".")):
        normalized = normalize_skill_name(skill_dir.name)
        authority[normalized] = {
            "name": skill_dir.name,
            "normalized_name": normalized,
            "authority_path": relative_to_project(skill_dir),
            "entrypoint_path": relative_to_project(find_entrypoint(skill_dir)),
            "contract_path": relative_to_project(find_contract(skill_dir)),
            "runtime_trigger": skill_dir.name,
            "migration_status": "authoritative",
            "source": ".agents/skills",
        }
    return authority


def _local_entrypoint(path: Path) -> Path:
    if path.is_file():
        return path
    candidates = list(path.glob("*.py")) + list((path / "scripts").glob("*.py"))
    return sorted(candidates)[0] if candidates else path


def _classify_local_skill(normalized_name: str, local_path: Path, authority: dict[str, dict[str, Any]]) -> tuple[str, str | None]:
    alias = ALIAS_MAP.get(normalized_name, normalized_name)
    authority_entry = authority.get(alias)
    if authority_entry:
        return "wrap", authority_entry["name"]

    if normalized_name == "dormancy":
        return "bootstrap-only", None

    if local_path.is_file() or list(local_path.glob("*.py")) or list((local_path / "scripts").glob("*.py")):
        return "migrate", None

    return "retire", None


def load_local_skills(authority: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    local_entries: list[dict[str, Any]] = []
    if not LOCAL_ROOT.exists():
        return local_entries

    for entry in sorted(LOCAL_ROOT.iterdir(), key=lambda item: item.name.lower()):
        if entry.name.startswith(".") or entry.name == "__pycache__":
            continue
        if entry.is_dir() or entry.suffix == ".py":
            name = entry.stem if entry.is_file() else entry.name
            normalized = normalize_skill_name(name)
            status, authority_alias = _classify_local_skill(normalized, entry, authority)
            local_entries.append(
                {
                    "name": name,
                    "normalized_name": normalized,
                    "local_path": relative_to_project(entry),
                    "entrypoint_path": relative_to_project(_local_entrypoint(entry)),
                    "migration_status": status,
                    "authority_alias": authority_alias,
                    "runtime_trigger": name,
                    "source": "src/skills/local",
                }
            )
    return local_entries


def build_registry_manifest() -> dict[str, Any]:
    authority = load_authoritative_skills()
    local_entries = load_local_skills(authority)

    skills: dict[str, dict[str, Any]] = {}
    duplicates: list[dict[str, Any]] = []

    for entry in authority.values():
        skills[entry["runtime_trigger"]] = entry

    for local in local_entries:
        key = local["authority_alias"] or local["runtime_trigger"]
        if local["migration_status"] == "wrap" and key in skills:
            duplicates.append(
                {
                    "local_name": local["name"],
                    "local_path": local["local_path"],
                    "authority_name": skills[key]["name"],
                    "authority_path": skills[key]["authority_path"],
                    "classification": "wrap",
                }
            )
            continue

        skills[local["runtime_trigger"]] = {
            "name": local["name"],
            "normalized_name": local["normalized_name"],
            "authority_path": local["local_path"],
            "entrypoint_path": local["entrypoint_path"],
            "contract_path": None,
            "runtime_trigger": local["runtime_trigger"],
            "migration_status": local["migration_status"],
            "source": local["source"],
            "authority_alias": local["authority_alias"],
        }

    return {
        "generated_at": int(time.time() * 1000),
        "authoritative_root": relative_to_project(AUTHORITY_ROOT),
        "skills": skills,
        "duplicates": duplicates,
        "local_candidates": local_entries,
    }


def render_report(manifest: dict[str, Any]) -> str:
    authoritative = [entry for entry in manifest["skills"].values() if entry["source"] == ".agents/skills"]
    non_authoritative = [entry for entry in manifest["skills"].values() if entry["source"] != ".agents/skills"]
    duplicates = manifest["duplicates"]

    lines = [
        "---",
        'title: "Skill Authority Report"',
        f'generated_at: "{time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(manifest["generated_at"] / 1000))}"',
        'authoritative_root: ".agents/skills"',
        "---",
        "",
        "# Skill Authority Report",
        "",
        "`.agents/skills/` is the authoritative woven-skill registry for Phase 1.",
        "Any `src/skills/local/` surface is transitional and must be classified rather than guessed.",
        "",
        f"- Authoritative skills: `{len(authoritative)}`",
        f"- Transitional local entries: `{len(non_authoritative)}`",
        f"- Duplicate definitions: `{len(duplicates)}`",
        "",
        "## Authoritative Registry",
        "",
    ]

    for entry in sorted(authoritative, key=lambda item: item["name"].lower()):
        lines.extend(
            [
                f"### {entry['name']}",
                f"- Authority Path: `{entry['authority_path']}`",
                f"- Entrypoint: `{entry['entrypoint_path'] or 'none'}`",
                f"- Contract: `{entry['contract_path'] or 'none'}`",
                f"- Runtime Trigger: `{entry['runtime_trigger']}`",
                "",
            ]
        )

    lines.extend(["## Transitional Local Skills", ""])
    for entry in sorted(non_authoritative, key=lambda item: item["name"].lower()):
        lines.extend(
            [
                f"### {entry['name']}",
                f"- Path: `{entry['authority_path']}`",
                f"- Migration Status: `{entry['migration_status']}`",
                f"- Authority Alias: `{entry.get('authority_alias') or 'none'}`",
                "",
            ]
        )

    lines.extend(["## Duplicate Definitions", ""])
    if duplicates:
        for duplicate in duplicates:
            lines.extend(
                [
                    f"- `{duplicate['local_name']}` -> `{duplicate['authority_name']}`",
                    f"  Local: `{duplicate['local_path']}`",
                    f"  Authority: `{duplicate['authority_path']}`",
                ]
            )
    else:
        lines.append("- No duplicate definitions detected.")

    lines.append("")
    return "\n".join(lines)


def write_outputs(manifest: dict[str, Any]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(render_report(manifest), encoding="utf-8")


def main() -> None:
    manifest = build_registry_manifest()
    write_outputs(manifest)
    print(f"Authoritative skills: {sum(1 for entry in manifest['skills'].values() if entry['source'] == '.agents/skills')}")
    print(f"Transitional local entries: {sum(1 for entry in manifest['skills'].values() if entry['source'] != '.agents/skills')}")
    print(f"Duplicate definitions: {len(manifest['duplicates'])}")
    print(f"Manifest: {MANIFEST_PATH}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
