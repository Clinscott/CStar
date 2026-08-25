from __future__ import annotations

import json
import re
import time
from pathlib import Path, PurePosixPath
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
AUTHORITY_ROOT = PROJECT_ROOT / ".agents" / "skills"
SPELL_ROOT = PROJECT_ROOT / ".agents" / "spells"
LOCAL_ROOT = PROJECT_ROOT / "src" / "skills" / "local"
MANIFEST_PATH = PROJECT_ROOT / ".agents" / "skill_registry.json"
REPORT_PATH = PROJECT_ROOT / "docs" / "reports" / "SKILL_AUTHORITY_REPORT.qmd"
TEST_ROOT = PROJECT_ROOT / "tests"

SAFE_ID = re.compile(r"^[a-z0-9](?:[a-z0-9:_-]*[a-z0-9])?$")
PATH_FIELDS = {
    "authority_path",
    "contract_path",
    "entrypoint_path",
    "instruction_path",
}
ALIAS_MAP = {
    "knowledgehunter": "hunt",
    "personaaudit": "persona",
    "skilllearning": "evolve",
    "visualexplainer": "visual-explainer",
}
TEST_ALIAS_MAP = {
    "calculus": ["gungnir", "calculus"],
    "chant": ["chant"],
    "forge": ["forge_candidate", "taliesin_forge_runtime"],
    "hall": ["hall_schema"],
    "manifest": ["state_registry_projection"],
    "orchestrate": ["operator_resume", "host_governor"],
    "silver_shield": ["heimdall_shield"],
    "start": ["start_runtime", "operator_resume"],
}


def normalize_skill_name(name: str) -> str:
    return "".join(character for character in name.lower() if character.isalnum())


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"skill registry duplicate JSON key: {key}")
        result[key] = value
    return result


def _safe_relative_path(value: str, label: str) -> None:
    if not value or "\\" in value:
        raise ValueError(f"skill registry {label} must be a safe relative POSIX path")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "." in path.parts:
        raise ValueError(f"skill registry {label} must stay inside the project")


def _validate_entry_paths(entry_id: str, entry: dict[str, Any]) -> None:
    for field in PATH_FIELDS:
        value = entry.get(field)
        if value is not None:
            if not isinstance(value, str):
                raise ValueError(f"skill registry entry '{entry_id}' {field} must be a string")
            _safe_relative_path(value, f"entry '{entry_id}' {field}")
    for field in ("contracts", "tests"):
        values = entry.get(field)
        if values is None:
            continue
        if not isinstance(values, list) or not all(isinstance(item, str) for item in values):
            raise ValueError(f"skill registry entry '{entry_id}' {field} must be a string array")
        for value in values:
            _safe_relative_path(value, f"entry '{entry_id}' {field}")


def require_registry_entry_map(value: Any) -> dict[str, dict[str, Any]]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("skill registry 'entries' must be an object keyed by capability id")

    normalized_ids: set[str] = set()
    for key, entry in value.items():
        if not isinstance(key, str) or key != key.strip().lower() or not SAFE_ID.fullmatch(key):
            raise ValueError("skill registry entry ids must be safe lowercase capability ids")
        normalized = key.lower()
        if normalized in normalized_ids:
            raise ValueError(f"skill registry duplicate capability id: {key}")
        if not isinstance(entry, dict):
            raise ValueError(f"skill registry entry '{key}' must be an object")
        if "id" in entry and entry["id"] != key:
            raise ValueError(f"skill registry entry '{key}' id must match its key")
        _validate_entry_paths(key, entry)
        normalized_ids.add(normalized)
    return value


def relative_to_project(path: Path | None) -> str | None:
    if path is None:
        return None
    try:
        return path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def find_entrypoint(skill_dir: Path) -> Path | None:
    for candidate in (
        skill_dir / "scripts" / f"{skill_dir.name}.py",
        skill_dir / f"{skill_dir.name}.py",
    ):
        if candidate.is_file():
            return candidate
    return None


def find_contract(skill_dir: Path) -> Path | None:
    for candidate in (
        skill_dir / "contract.json",
        skill_dir / f"{skill_dir.name}.feature",
        skill_dir / "SKILL.md",
        skill_dir / "SKILL.qmd",
    ):
        if candidate.is_file():
            return candidate
    return None


def load_existing_registry() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        return {
            "version": "3.0",
            "generated_at": int(time.time() * 1000),
            "tiers": {},
            "intent_grammar": {},
            "entries": {},
        }
    data = json.loads(
        MANIFEST_PATH.read_text(encoding="utf-8"),
        object_pairs_hook=_reject_duplicate_pairs,
    )
    if not isinstance(data, dict):
        raise ValueError("skill registry root must be an object")
    data["entries"] = require_registry_entry_map(data.get("entries"))
    return data


def load_authoritative_skills() -> dict[str, dict[str, Any]]:
    authority: dict[str, dict[str, Any]] = {}
    if not AUTHORITY_ROOT.exists():
        return authority
    directories = sorted(
        (item for item in AUTHORITY_ROOT.iterdir() if item.is_dir() and not item.name.startswith(".")),
        key=lambda item: item.name,
    )
    for skill_dir in directories:
        if not SAFE_ID.fullmatch(skill_dir.name):
            continue
        normalized = normalize_skill_name(skill_dir.name)
        if normalized in authority:
            raise ValueError(f"skill registry duplicate authoritative skill: {skill_dir.name}")
        authority[normalized] = {
            "name": skill_dir.name,
            "authority_path": relative_to_project(skill_dir),
            "entrypoint_path": relative_to_project(find_entrypoint(skill_dir)),
            "contract_path": relative_to_project(find_contract(skill_dir)),
        }
    return authority


def _local_entrypoint(path: Path) -> Path:
    if path.is_file():
        return path
    candidates = sorted((*path.glob("*.py"), *(path / "scripts").glob("*.py")))
    return candidates[0] if candidates else path


def load_local_skills(authority: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    if not LOCAL_ROOT.exists():
        return []
    entries: list[dict[str, Any]] = []
    for item in sorted(LOCAL_ROOT.iterdir(), key=lambda path: path.name.lower()):
        if item.name.startswith(".") or item.name == "__pycache__":
            continue
        if not item.is_dir() and item.suffix != ".py":
            continue
        name = item.stem if item.is_file() else item.name
        normalized = normalize_skill_name(name)
        alias = ALIAS_MAP.get(normalized, normalized)
        authority_alias = authority.get(alias, {}).get("name")
        if authority_alias:
            status = "wrap"
        elif normalized == "dormancy":
            status = "bootstrap-only"
        elif item.is_file() or _local_entrypoint(item) != item:
            status = "migrate"
        else:
            status = "retire"
        entries.append({
            "name": name,
            "normalized_name": normalized,
            "local_path": relative_to_project(item),
            "entrypoint_path": relative_to_project(_local_entrypoint(item)),
            "migration_status": status,
            "authority_alias": authority_alias,
            "runtime_trigger": name,
            "source": "src/skills/local",
        })
    return entries


def infer_authority_path(entry_name: str, entry: dict[str, Any]) -> str | None:
    declared = entry.get("authority_path")
    if isinstance(declared, str) and declared:
        candidate = (PROJECT_ROOT / declared).resolve()
        try:
            candidate.relative_to(PROJECT_ROOT.resolve())
        except ValueError:
            return None
        if candidate.exists():
            return relative_to_project(candidate)
    instruction = entry.get("instruction_path")
    if isinstance(instruction, str) and instruction:
        candidate = (PROJECT_ROOT / instruction).resolve()
        if candidate.exists():
            return relative_to_project(candidate if candidate.is_dir() else candidate.parent)
    skill_dir = AUTHORITY_ROOT / entry_name
    if skill_dir.exists():
        return relative_to_project(skill_dir)
    spell_file = SPELL_ROOT / f"{entry_name}.md"
    return relative_to_project(spell_file) if spell_file.exists() else None


def infer_entrypoint_path(
    entry_name: str,
    authority_path: str | None,
    entry: dict[str, Any],
) -> str | None:
    declared = entry.get("entrypoint_path")
    if isinstance(declared, str) and declared:
        candidate = (PROJECT_ROOT / declared).resolve()
        try:
            candidate.relative_to(PROJECT_ROOT.resolve())
        except ValueError:
            candidate = Path()
        if candidate.is_file():
            return relative_to_project(candidate)
    if not authority_path:
        return None
    authority = PROJECT_ROOT / authority_path
    if authority.is_file():
        return None
    entrypoint = find_entrypoint(authority)
    if entrypoint:
        return relative_to_project(entrypoint)
    if entry_name in {"chant", "orchestrate", "ravens", "start"}:
        runtime = PROJECT_ROOT / "src/node/core/runtime/weaves" / f"{entry_name}.ts"
        if runtime.is_file():
            return relative_to_project(runtime)
    return None


def infer_contract_path(authority_path: str | None) -> str | None:
    if not authority_path:
        return None
    authority = PROJECT_ROOT / authority_path
    if authority.is_file():
        return relative_to_project(authority)
    return relative_to_project(find_contract(authority))


def infer_tests(entry_name: str, entry: dict[str, Any]) -> list[str]:
    declared = entry.get("tests")
    if isinstance(declared, list) and declared:
        return list(declared)
    tokens = {
        normalize_skill_name(entry_name),
        *(normalize_skill_name(value) for value in TEST_ALIAS_MAP.get(entry_name, [])),
    }
    candidates: list[str] = []
    if TEST_ROOT.exists():
        for candidate in TEST_ROOT.rglob("*"):
            if not candidate.is_file() or candidate.suffix not in {".py", ".ts"}:
                continue
            relative = candidate.relative_to(PROJECT_ROOT).as_posix()
            if "/fixtures/" in relative or "__pycache__" in relative:
                continue
            haystack = normalize_skill_name(relative)
            if any(token and token in haystack for token in tokens):
                candidates.append(relative)
    return sorted(candidates, key=lambda value: (not value.startswith("tests/unit/"), value))[:4]


def enrich_entry(entry_name: str, entry: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(entry)
    execution = enriched.get("execution") if isinstance(enriched.get("execution"), dict) else {}
    tier = str(enriched.get("tier") or "").upper()
    mode = str(execution.get("mode") or "").lower()
    ownership = str(execution.get("ownership_model") or "").lower()
    authority_path = infer_authority_path(entry_name, enriched)
    contract_path = infer_contract_path(authority_path)

    enriched["runtime_trigger"] = str(enriched.get("runtime_trigger") or entry_name)
    enriched["authority_path"] = authority_path
    enriched["entrypoint_path"] = infer_entrypoint_path(entry_name, authority_path, enriched)
    enriched["contract_path"] = contract_path
    enriched["viability"] = (
        "DEPRECATED"
        if entry_name == "_archive" or authority_path == ".agents/skills/_archive"
        else str(enriched.get("viability") or "PLANNED").upper()
    )
    if tier == "SPELL":
        enriched["owner_runtime"] = "policy-layer"
    elif ownership == "kernel-primitive":
        enriched["owner_runtime"] = str(enriched.get("owner_runtime") or "cstar-kernel")
    elif ownership == "host-workflow":
        enriched["owner_runtime"] = "host-agent"
    else:
        enriched["owner_runtime"] = str(enriched.get("owner_runtime") or "host-agent")

    declared_support = enriched.get("host_support")
    if not isinstance(declared_support, dict):
        if tier == "SPELL":
            declared_support = {host: "policy-only" for host in ("gemini", "codex", "claude")}
        elif mode == "agent-native" or enriched["owner_runtime"] == "host-agent":
            declared_support = {"gemini": "native-session", "codex": "exec-bridge", "claude": "exec-bridge"}
        elif mode == "kernel-backed":
            declared_support = {host: "supported" for host in ("gemini", "codex", "claude")}
        else:
            declared_support = {host: "unknown" for host in ("gemini", "codex", "claude")}
    enriched["host_support"] = declared_support

    if tier == "SPELL":
        enriched["spell_classification"] = str(enriched.get("spell_classification") or "policy-only")
    if enriched.get("entry_surface") not in {"cli", "host-only", "compatibility"}:
        enriched["entry_surface"] = "host-only" if tier == "SPELL" or entry_name == "chant" else "cli"
    if not enriched.get("recursion_policy"):
        enriched["recursion_policy"] = (
            "policy-only" if tier == "SPELL"
            else "bounded-orchestrator" if entry_name in {"chant", "orchestrate", "ravens", "start"}
            else "bounded-composite" if tier == "WEAVE"
            else "leaf"
        )
    contracts = enriched.get("contracts")
    enriched["contracts"] = list(contracts) if isinstance(contracts, list) and contracts else ([contract_path] if contract_path else [])
    enriched["tests"] = infer_tests(entry_name, enriched)
    return enriched


def collect_authority_issues(entries: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    required = ("authority_path", "owner_runtime", "host_support", "recursion_policy", "entry_surface", "contracts", "tests")
    for name, entry in sorted(entries.items()):
        if entry.get("viability") != "ACTIVE":
            continue
        missing = [field for field in required if not entry.get(field)]
        execution = entry.get("execution") if isinstance(entry.get("execution"), dict) else {}
        if (
            str(execution.get("mode") or "").lower() in {"agent-native", "kernel-backed"}
            and execution.get("ownership_model") not in {"host-workflow", "kernel-primitive"}
        ):
            missing.append("execution.ownership_model")
        if missing:
            issues.append({"entry": name, "missing_fields": missing})
    return issues


def build_registry_manifest() -> dict[str, Any]:
    existing = load_existing_registry()
    authority = load_authoritative_skills()
    local_entries = load_local_skills(authority)
    entries = {
        name: enrich_entry(name, entry)
        for name, entry in existing["entries"].items()
    }
    for authority_entry in authority.values():
        name = authority_entry["name"]
        entries.setdefault(name, enrich_entry(name, {
            "tier": "SKILL",
            "description": "",
            "instruction_path": f"{authority_entry['authority_path']}/SKILL.md",
            "execution": {"mode": "agent-native", "ownership_model": "host-workflow"},
            "viability": "ACTIVE",
            "risk": "safe",
        }))
    duplicates = [
        {
            "local_name": local["name"],
            "local_path": local["local_path"],
            "authority_name": local["authority_alias"],
            "authority_path": entries[local["authority_alias"]]["authority_path"],
            "classification": "wrap",
        }
        for local in local_entries
        if local["migration_status"] == "wrap" and local["authority_alias"] in entries
    ]
    generated_at = int(time.time() * 1000)
    return {
        **existing,
        "generated_at": generated_at,
        "entries": entries,
        "authority_audit": {
            "generated_at": generated_at,
            "authoritative_root": relative_to_project(AUTHORITY_ROOT),
            "duplicates": duplicates,
            "local_candidates": local_entries,
            "authority_issues": collect_authority_issues(entries),
        },
    }


def render_report(manifest: dict[str, Any]) -> str:
    audit = manifest["authority_audit"]
    lines = [
        "---",
        'title: "Skill Authority Report"',
        "---",
        "",
        "# Skill Authority Report",
        "",
        f"- Authoritative skills: `{len(manifest['entries'])}`",
        f"- Transitional local entries: `{len(audit['local_candidates'])}`",
        f"- Duplicate definitions: `{len(audit['duplicates'])}`",
        f"- Active capability authority issues: `{len(audit['authority_issues'])}`",
        "",
        "## Authoritative Registry",
        "",
    ]
    for name, entry in sorted(manifest["entries"].items()):
        lines.extend([
            f"### {name}",
            f"- Authority Path: `{entry.get('authority_path') or 'none'}`",
            f"- Entrypoint: `{entry.get('entrypoint_path') or 'none'}`",
            f"- Entry Surface: `{entry.get('entry_surface') or 'none'}`",
            "",
        ])
    return "\n".join(lines)


def write_outputs(manifest: dict[str, Any]) -> None:
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    REPORT_PATH.write_text(render_report(manifest), encoding="utf-8")


def main() -> None:
    manifest = build_registry_manifest()
    write_outputs(manifest)
    audit = manifest["authority_audit"]
    print(f"Authoritative skills: {len(manifest['entries'])}")
    print(f"Duplicate definitions: {len(audit['duplicates'])}")
    print(f"Active capability authority issues: {len(audit['authority_issues'])}")


if __name__ == "__main__":
    main()
