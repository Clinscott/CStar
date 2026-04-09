from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
AUTHORITY_ROOT = PROJECT_ROOT / ".agents" / "skills"
SPELL_ROOT = PROJECT_ROOT / ".agents" / "spells"
LOCAL_ROOT = PROJECT_ROOT / "src" / "skills" / "local"
MANIFEST_PATH = PROJECT_ROOT / ".agents" / "skill_registry.json"
REPORT_PATH = PROJECT_ROOT / "docs" / "reports" / "SKILL_AUTHORITY_REPORT.qmd"
TEST_ROOT = PROJECT_ROOT / "tests"

ALIAS_MAP = {
    "cachebro": "cachebro",
    "knowledgehunter": "hunt",
    "oracle": "oracle",
    "personaaudit": "persona",
    "skilllearning": "evolve",
    "visualexplainer": "visual-explainer",
}

TEST_ALIAS_MAP = {
    "hall": ["hall_schema"],
    "status": ["health", "runtime_command_invocations"],
    "metrics": ["metrics", "metrics_engine"],
    "manifest": ["state_registry_projection"],
    "qmd_search": ["search", "qmd"],
    "oracle": ["oracle_command"],
    "calculus": ["gungnir", "calculus"],
    "forge": ["forge_candidate", "taliesin_forge_runtime"],
    "bookmark-weaver": ["bookmark"],
    "hunt": ["search", "mimir"],
    "one-mind": ["intelligence_contract", "mimir_client"],
    "personas": ["persona"],
    "ravens": ["ravens", "muninn"],
    "sterling": ["sterling_auditor"],
    "vitals": ["vitals", "health"],
    "agentic-ingest": ["intelligence_contract"],
    "autobot": ["autobot", "chant_autobot_handoff"],
    "research": ["research", "host_session_weaves"],
    "distill": ["distill"],
    "chant": ["chant"],
    "orchestrate": ["operator_resume", "host_governor"],
    "start": ["start_runtime", "operator_resume"],
}


def normalize_skill_name(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def build_search_tokens(*values: str | None) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        if not value:
            continue
        normalized = normalize_skill_name(value)
        if normalized:
            tokens.add(normalized)
        for part in re.split(r"[^A-Za-z0-9]+", value):
            part_normalized = normalize_skill_name(part)
            if len(part_normalized) >= 3:
                tokens.add(part_normalized)
    return tokens


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


def load_existing_registry() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        return {
            "version": "2.0",
            "generated_at": int(time.time() * 1000),
            "tiers": {},
            "intent_grammar": {},
            "entries": {},
        }
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


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


def infer_authority_path(entry_name: str, entry: dict[str, Any]) -> str | None:
    instruction_path = entry.get("instruction_path")
    if isinstance(instruction_path, str) and instruction_path.strip():
        instruction = (PROJECT_ROOT / instruction_path).resolve()
        if instruction.exists():
            if instruction.is_dir():
                return relative_to_project(instruction)
            if instruction.parent == AUTHORITY_ROOT / entry_name:
                return relative_to_project(instruction.parent)
            return relative_to_project(instruction)

    skill_dir = AUTHORITY_ROOT / entry_name
    if skill_dir.exists():
        return relative_to_project(skill_dir)

    spell_file = SPELL_ROOT / f"{entry_name}.md"
    if spell_file.exists():
        return relative_to_project(spell_file)

    return None


def infer_entrypoint_path(entry_name: str, authority_path: str | None) -> str | None:
    if not authority_path:
        return None

    authority = PROJECT_ROOT / authority_path
    if authority.is_file():
        return None

    entrypoint = find_entrypoint(authority)
    if entrypoint is not None:
        return relative_to_project(entrypoint)

    if entry_name in {"chant", "orchestrate", "ravens", "start"}:
        runtime_file = PROJECT_ROOT / "src" / "node" / "core" / "runtime" / "weaves" / f"{entry_name}.ts"
        if runtime_file.exists():
            return relative_to_project(runtime_file)

    return None


def infer_contract_path(authority_path: str | None) -> str | None:
    if not authority_path:
        return None

    authority = PROJECT_ROOT / authority_path
    if authority.is_file():
        return relative_to_project(authority)

    contract = find_contract(authority)
    if contract is not None:
        return relative_to_project(contract)
    return None


def infer_owner_runtime(entry_name: str, entry: dict[str, Any]) -> str:
    execution_mode = str(entry.get("execution", {}).get("mode") or "").strip().lower()
    ownership_model = str(entry.get("execution", {}).get("ownership_model") or "").strip().lower()
    tier = str(entry.get("tier") or "").strip().upper()

    if tier == "SPELL":
        return "policy-layer"
    if ownership_model == "kernel-primitive":
        return "cstar-kernel"
    if ownership_model == "host-workflow":
        return "host-agent"
    if execution_mode == "kernel-backed":
        return "cstar-kernel"
    return "host-agent"


def infer_viability(entry_name: str, authority_path: str | None, entry: dict[str, Any]) -> str:
    declared = str(entry.get("viability") or "").strip().upper()
    if entry_name == "_archive" or authority_path == ".agents/skills/_archive":
        return "DEPRECATED"
    if declared:
        return declared
    return "PLANNED"


def infer_host_support(entry: dict[str, Any]) -> dict[str, str]:
    declared = entry.get("host_support")
    if isinstance(declared, dict) and all(isinstance(key, str) and isinstance(value, str) for key, value in declared.items()):
        normalized_declared = {key: value.strip() for key, value in declared.items()}
        if set(normalized_declared.values()) != {"supported"}:
            return normalized_declared

    execution_mode = str(entry.get("execution", {}).get("mode") or "").strip().lower()
    owner_runtime = str(entry.get("owner_runtime") or "").strip().lower()
    if owner_runtime == "policy-layer":
        return {
            "gemini": "policy-only",
            "codex": "policy-only",
            "claude": "policy-only",
        }

    if execution_mode == "kernel-backed" or owner_runtime == "cstar-runtime":
        return {
            "gemini": "supported",
            "codex": "supported",
            "claude": "supported",
        }

    if execution_mode == "agent-native" or owner_runtime == "host-agent":
        return {
            "gemini": "native-session",
            "codex": "exec-bridge",
            "claude": "exec-bridge",
        }

    return {
        "gemini": "unknown",
        "codex": "unknown",
        "claude": "unknown",
    }


def infer_recursion_policy(entry_name: str, entry: dict[str, Any]) -> str:
    declared = entry.get("recursion_policy")
    if isinstance(declared, str) and declared.strip():
        return declared.strip()

    tier = str(entry.get("tier") or "").strip().upper()
    if tier == "SPELL":
        return "policy-only"
    if entry_name in {"autobot", "chant", "evolve", "orchestrate", "ravens", "start"}:
        return "bounded-orchestrator"
    if tier == "WEAVE":
        return "bounded-composite"
    return "leaf"


def infer_entry_surface(entry_name: str, entry: dict[str, Any]) -> str:
    declared = str(entry.get("entry_surface") or "").strip().lower()
    if declared in {"cli", "host-only", "compatibility"}:
        return declared

    tier = str(entry.get("tier") or "").strip().upper()
    execution_mode = str(entry.get("execution", {}).get("mode") or "").strip().lower()
    spell_classification = str(entry.get("spell_classification") or "").strip().lower()

    if tier == "SPELL" or execution_mode == "policy-only" or spell_classification == "policy-only":
        return "host-only"
    if entry_name == "chant":
        return "host-only"

    return "cli"


def infer_spell_classification(entry: dict[str, Any]) -> str | None:
    tier = str(entry.get("tier") or "").strip().upper()
    if tier != "SPELL":
        return None

    declared = entry.get("spell_classification")
    if isinstance(declared, str) and declared.strip():
        return declared.strip()

    viability = str(entry.get("viability") or "").strip().upper()
    execution_mode = str(entry.get("execution", {}).get("mode") or "").strip().lower()
    owner_runtime = str(entry.get("owner_runtime") or "").strip().lower()

    if viability == "DEPRECATED":
        return "deprecated"
    if execution_mode == "kernel-backed" and owner_runtime != "policy-layer":
        return "runtime-backed"
    return "policy-only"


def infer_contracts(contract_path: str | None, entry: dict[str, Any]) -> list[str]:
    declared = entry.get("contracts")
    if isinstance(declared, list) and all(isinstance(item, str) for item in declared):
        values = [item for item in declared if item.strip()]
        if values:
            return values

    return [contract_path] if contract_path else []


def infer_tests(entry_name: str, entry: dict[str, Any]) -> list[str]:
    declared = entry.get("tests")
    if isinstance(declared, list) and all(isinstance(item, str) for item in declared):
        values = [item for item in declared if item.strip()]
        if values:
            return values

    if not TEST_ROOT.exists():
        return []

    contract_tokens = []
    for contract in entry.get("contracts", []):
        contract_tokens.append(Path(contract).stem)

    search_tokens = build_search_tokens(
        entry_name,
        entry.get("runtime_trigger"),
        entry.get("instruction_path"),
        entry.get("authority_path"),
        entry.get("entrypoint_path"),
        entry.get("contract_path"),
        *contract_tokens,
        *TEST_ALIAS_MAP.get(entry_name, []),
    )
    if not search_tokens:
        return []

    candidates: list[tuple[int, str]] = []
    for candidate in TEST_ROOT.rglob("*"):
        if not candidate.is_file():
            continue
        relative = candidate.relative_to(PROJECT_ROOT).as_posix()
        if any(segment in relative for segment in ("/fixtures/", "__pycache__", ".legacy")):
            continue
        if candidate.suffix not in {".py", ".ts"}:
            continue
        if not candidate.name.startswith("test_") and ".test." not in candidate.name:
            continue

        relative_parts = [normalize_skill_name(part) for part in candidate.parts]
        stem_tokens = build_search_tokens(candidate.stem, *candidate.parts)
        score = 0
        for token in search_tokens:
            if token in stem_tokens:
                score += 5
            elif token in relative_parts:
                score += 3
        if score <= 0:
            continue
        if relative.startswith("tests/unit/"):
            score += 3
        elif relative.startswith("tests/contracts/") or relative.startswith("tests/crucible/"):
            score += 2
        elif relative.startswith("tests/empire_tests/") or relative.startswith("tests/quarantine/"):
            score += 1
        candidates.append((score, relative))

    ranked = sorted(candidates, key=lambda item: (-item[0], item[1]))
    seen: set[str] = set()
    selected: list[str] = []
    for _, candidate in ranked:
        if candidate in seen:
            continue
        seen.add(candidate)
        selected.append(candidate)
        if len(selected) >= 4:
            break
    if selected:
        return selected
    if str(entry.get("owner_runtime") or "").strip().lower() == "policy-layer":
        return ["tests/unit/test_skill_registry_audit.py"]
    return []


def enrich_entry(entry_name: str, entry: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(entry)
    authority_path = infer_authority_path(entry_name, enriched)
    contract_path = infer_contract_path(authority_path)

    enriched["runtime_trigger"] = str(enriched.get("runtime_trigger") or entry_name)
    enriched["authority_path"] = authority_path
    enriched["viability"] = infer_viability(entry_name, authority_path, enriched)
    enriched["entrypoint_path"] = infer_entrypoint_path(entry_name, authority_path)
    enriched["contract_path"] = contract_path
    enriched["owner_runtime"] = infer_owner_runtime(entry_name, enriched)
    enriched["host_support"] = infer_host_support(enriched)
    enriched["recursion_policy"] = infer_recursion_policy(entry_name, enriched)
    spell_classification = infer_spell_classification(enriched)
    if spell_classification is not None:
        enriched["spell_classification"] = spell_classification
    enriched["entry_surface"] = infer_entry_surface(entry_name, enriched)
    enriched["contracts"] = infer_contracts(contract_path, enriched)
    enriched["tests"] = infer_tests(entry_name, enriched)
    return enriched


def collect_authority_issues(entries: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    required_fields = [
        "authority_path",
        "owner_runtime",
        "host_support",
        "recursion_policy",
        "entry_surface",
        "contracts",
        "tests",
    ]

    for name, entry in sorted(entries.items()):
        if entry.get("viability") != "ACTIVE":
            continue

        missing: list[str] = []
        for field in required_fields:
            value = entry.get(field)
            if value is None:
                missing.append(field)
                continue
            if isinstance(value, str) and not value.strip():
                missing.append(field)
                continue
            if isinstance(value, list) and field in {"contracts", "tests"} and not value:
                missing.append(field)

        if missing:
            issues.append(
                {
                    "entry": name,
                    "missing_fields": missing,
                }
            )

        if str(entry.get("tier") or "").strip().upper() == "SPELL":
            classification = entry.get("spell_classification")
            if not isinstance(classification, str) or not classification.strip():
                issues.append(
                    {
                        "entry": name,
                        "missing_fields": ["spell_classification"],
                    }
                )

        execution_mode = str(entry.get("execution", {}).get("mode") or "").strip().lower()
        ownership_model = str(entry.get("execution", {}).get("ownership_model") or "").strip().lower()
        if execution_mode in {"agent-native", "kernel-backed"} and ownership_model not in {"host-workflow", "kernel-primitive"}:
            issues.append(
                {
                    "entry": name,
                    "missing_fields": ["execution.ownership_model"],
                }
            )

    return issues


def build_registry_manifest() -> dict[str, Any]:
    existing = load_existing_registry()
    authority = load_authoritative_skills()
    local_entries = load_local_skills(authority)

    entries: dict[str, dict[str, Any]] = {}
    duplicates: list[dict[str, Any]] = []

    for entry_name, existing_entry in existing.get("entries", {}).items():
        if isinstance(existing_entry, dict):
            entries[entry_name] = enrich_entry(entry_name, existing_entry)

    for authority_entry in authority.values():
        trigger = authority_entry["runtime_trigger"]
        if trigger not in entries:
            entries[trigger] = enrich_entry(
                trigger,
                {
                    "tier": "SKILL",
                    "description": "",
                    "instruction_path": f"{authority_entry['authority_path']}/SKILL.md" if authority_entry["authority_path"] else None,
                    "execution": {
                        "mode": "agent-native",
                        "ownership_model": "host-workflow",
                    },
                    "viability": "ACTIVE",
                    "risk": "safe",
                },
            )

    for local in local_entries:
        key = local["authority_alias"] or local["runtime_trigger"]
        if local["migration_status"] == "wrap" and key in entries:
            duplicates.append(
                {
                    "local_name": local["name"],
                    "local_path": local["local_path"],
                    "authority_name": key,
                    "authority_path": entries[key]["authority_path"],
                    "classification": "wrap",
                }
            )

    audit = {
        "generated_at": int(time.time() * 1000),
        "authoritative_root": relative_to_project(AUTHORITY_ROOT),
        "duplicates": duplicates,
        "local_candidates": local_entries,
        "authority_issues": collect_authority_issues(entries),
    }

    manifest = {
        **existing,
        "generated_at": audit["generated_at"],
        "entries": entries,
        "authority_audit": audit,
    }
    return manifest


def render_report(manifest: dict[str, Any]) -> str:
    audit = manifest["authority_audit"]
    authoritative = [
        {"name": name, **entry}
        for name, entry in manifest["entries"].items()
        if entry.get("instruction_path", "").startswith(".agents/skills/")
    ]
    non_authoritative = [entry for entry in audit["local_candidates"]]
    duplicates = audit["duplicates"]
    issues = audit["authority_issues"]

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
        f"- Active capability authority issues: `{len(issues)}`",
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
                f"- Owner Runtime: `{entry.get('owner_runtime') or 'none'}`",
                f"- Entry Surface: `{entry.get('entry_surface') or 'none'}`",
                f"- Host Support: `{json.dumps(entry.get('host_support', {}), ensure_ascii=True)}`",
                f"- Recursion Policy: `{entry.get('recursion_policy') or 'none'}`",
                f"- Contracts: `{', '.join(entry.get('contracts', [])) or 'none'}`",
                f"- Tests: `{', '.join(entry.get('tests', [])) or 'none'}`",
                "",
            ]
        )

    lines.extend(["## Transitional Local Skills", ""])
    for entry in sorted(non_authoritative, key=lambda item: item["name"].lower()):
        lines.extend(
            [
                f"### {entry['name']}",
                f"- Path: `{entry['local_path']}`",
                f"- Migration Status: `{entry['migration_status']}`",
                f"- Authority Alias: `{entry.get('authority_alias') or 'none'}`",
                "",
            ]
        )

    lines.extend(["## Active Capability Authority Issues", ""])
    if issues:
        for issue in issues:
            lines.append(f"- `{issue['entry']}` missing: `{', '.join(issue['missing_fields'])}`")
    else:
        lines.append("- No active capability authority issues detected.")

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
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(render_report(manifest), encoding="utf-8")


def main() -> None:
    manifest = build_registry_manifest()
    write_outputs(manifest)
    audit = manifest["authority_audit"]
    print(f"Authoritative skills: {sum(1 for entry in manifest['entries'].values() if str(entry.get('instruction_path') or '').startswith('.agents/skills/'))}")
    print(f"Transitional local entries: {len(audit['local_candidates'])}")
    print(f"Duplicate definitions: {len(audit['duplicates'])}")
    print(f"Active capability authority issues: {len(audit['authority_issues'])}")
    print(f"Manifest: {MANIFEST_PATH}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
