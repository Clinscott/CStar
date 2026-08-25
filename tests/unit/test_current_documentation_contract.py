"""Focused contracts for current CStar documentation topology."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OPERATOR_SKILLS = {"corvus-forge", "researcher", "cstar-closeout", "cstar-reliability-loop"}
COMPATIBILITY_SKILLS = {"calculus"}


def _read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def _flat(text: str) -> str:
    return " ".join(text.split())


def test_current_registry_and_docs_expose_four_agent_native_skills() -> None:
    registry = json.loads(_read(".agents/skill_registry.json"))
    entries = registry["entries"]
    default_entries = {
        name for name, entry in entries.items()
        if entry["entry_surface"] == "host-only"
    }
    compatibility_entries = {
        name for name, entry in entries.items()
        if entry["entry_surface"] == "compatibility"
    }

    assert set(entries) == DEFAULT_OPERATOR_SKILLS | COMPATIBILITY_SKILLS
    assert default_entries == DEFAULT_OPERATOR_SKILLS
    assert compatibility_entries == COMPATIBILITY_SKILLS
    for name in DEFAULT_OPERATOR_SKILLS:
        entry = entries[name]
        assert entry["tier"] == "SKILL"
        assert entry["entry_surface"] == "host-only"
        assert entry["execution"]["mode"] == "agent-native"
        assert entry["owner_runtime"] == "host-agent"

    calculus = entries["calculus"]
    assert calculus["tier"] == "PRIME"
    assert calculus["entry_surface"] == "compatibility"
    assert calculus["execution"]["mode"] == "compatibility"
    assert calculus["owner_runtime"] == "compatibility-library"
    assert set(calculus["host_support"].values()) == {"unsupported"}
    assert "not registered in the default operator catalog" in calculus["description"]

    for relative in (
        "docs/architecture/SKILL_REGISTRY.md",
        "docs/architecture/SKILL_PERMUTATIONS.md",
        "docs/integrations/host_native_skill_contract.md",
        "docs/integrations/cstar_capability_discovery_api.md",
    ):
        text = _read(relative)
        for skill in DEFAULT_OPERATOR_SKILLS:
            assert f"`{skill}`" in text, (relative, skill)
        assert "`calculus`" not in text, relative


def test_current_architecture_docs_reject_legacy_execution_topology() -> None:
    registry_doc = _read("docs/architecture/SKILL_REGISTRY.md")
    weave_doc = _read("docs/architecture/WEAVES.md")
    host_doc = _read("docs/integrations/host_native_skill_contract.md")

    assert "single source of truth for all capabilities" not in registry_doc
    assert "The Weaves (" not in registry_doc
    assert "autonomous Weave framework is retired" in weave_doc
    assert "exposes no Orchestrate or HostGovernor adapter" in weave_doc
    assert "There is no reverse model bridge" not in host_doc  # wording lives in compatibility pointer
    assert "does not create a callback from CStar into the host" in host_doc
    assert "MimirClient.request" not in host_doc
    assert "PMTs may be queried only as mapped project information repositories" in host_doc
    assert "MM is inactive and has no active routing, synthesis, ownership, relay, review, or execution role" in " ".join(host_doc.split())


def test_codex_active_turn_identity_is_a_root_user_projection() -> None:
    kernel_doc = _read("docs/integrations/cstar-kernel-mcp.md")

    assert "one ordered root-user projection" in kernel_doc
    assert "they never join, close, timestamp, or" in kernel_doc
    assert "invalidate a root-user cohort" in kernel_doc
    assert "tagged row that explicitly" in kernel_doc
    assert "without the canonical" in kernel_doc
    assert "selected-turn id on any non-root-user record fails closed" not in kernel_doc


def test_codex_identity_streams_a_bounded_long_lived_session_projection() -> None:
    kernel_doc = _read("docs/integrations/cstar-kernel-mcp.md")

    assert "bounded stream" in kernel_doc
    assert "hashes the complete file" in kernel_doc
    assert "strictly validates every UTF-8 JSONL row" in kernel_doc
    assert "retains no raw authority-row list" in kernel_doc
    assert "physical file remains capped at 512 MiB" in kernel_doc
    assert "full scan at 1,000,000 rows" in kernel_doc
    assert "selected-turn limits of 256 records and 4 MiB" in kernel_doc
    assert "derived from the same descriptor scan" in kernel_doc
    assert "no second session" in kernel_doc


def test_forge_docs_match_the_empty_hermes_toolset_contract() -> None:
    kernel_doc = _read("docs/integrations/cstar-kernel-mcp.md")
    playbook = _read("docs/operations/corvus-forge-pipeline-playbook.md")
    skill_spec = _read("docs/operations/corvus-forge-skill-spec.md")
    delegate = _read(
        ".agents/skills/corvus-forge/scripts/hermes_minimax_delegate.mjs"
    )

    assert "Hermes exposes no tools under exact Forge mode" in kernel_doc
    assert "Hermes exposes only `clarify`" not in kernel_doc
    for text in (kernel_doc, playbook, skill_spec):
        assert "`context_engine`" in text
    assert "const NO_TOOLS_TOOLSET = 'context_engine';" in delegate


def test_forge_docs_require_process_containment_and_runtime_lineage() -> None:
    kernel_doc = _read("docs/integrations/cstar-kernel-mcp.md")
    playbook = _read("docs/operations/corvus-forge-pipeline-playbook.md")
    skill_spec = _read("docs/operations/corvus-forge-skill-spec.md")

    for text in (kernel_doc, playbook, skill_spec):
        assert "Bubblewrap" in text
        assert "PID 1" in text
        assert "-I -S -B" in text
        assert "no site-packages" in text
        assert "sys.pycache_prefix" in text
    assert "console stub is a locator, not lineage proof" in playbook
    assert "same in-memory bytes" in playbook
    assert "requires the CStar-bound proof" in skill_spec


def test_forge_docs_require_hermes_owned_oauth_without_credential_env() -> None:
    docs = tuple(
        _read(relative)
        for relative in (
            "docs/integrations/cstar-kernel-mcp.md",
            "docs/operations/corvus-forge-pipeline-playbook.md",
            "docs/operations/corvus-forge-skill-spec.md",
        )
    )

    for text in docs:
        assert "minimax-oauth" in text
        assert "cstar-hub" in text
        assert "2100 seconds" in text
        assert "before reservation" in text or "before an attempt is reserved" in text
        assert "forge-minimax.env" not in text
        assert "MINIMAX_API_KEY" not in text
        assert "descriptor 3" not in text
        assert "never" in text and "opens" in text and "`auth.json`" in text
        assert "idempotency-key" in text and "replay" in text
        assert "forge_minimax_oauth.py" in text


def test_forge_docs_require_natural_work_authorization_and_safe_replay() -> None:
    docs = tuple(
        _flat(_read(relative))
        for relative in (
            "docs/integrations/cstar-kernel-mcp.md",
            "docs/operations/corvus-forge-pipeline-playbook.md",
            "docs/operations/corvus-forge-skill-spec.md",
        )
    )

    for text in docs:
        assert "cstar_forge_authorize" in text
        assert "authorization_manifest" in text
        assert "PENDING_AUTH" in text
        assert "build" in text and "implement" in text and "repair" in text
        assert "bead" in text and "decision" in text and "target" in text
        assert "no machine challenge" in text
        assert "same root-user turn" in text
        assert "later root-user turn" in text
        assert "idempotency" in text
        assert "after runtime/OAuth preflight" in text or "after runtime/ OAuth preflight" in text
        assert "legacy freeform" in text
        assert "CSTAR_FORGE_AUTHORIZE v1" not in text
    kernel = docs[0]
    assert "one user record" in kernel and "bounded canonical `input_text`" in kernel
    assert "forge_operator_authorization_required" in kernel
    assert "operator never pastes machine tokens" in kernel
    assert "A later root-user turn can retrieve an already durable attempt" in kernel
    assert "cstar.forge_pre_provider_continuation.v1" in kernel


def test_forge_natural_authorization_feature_is_fail_closed() -> None:
    feature = _read("tests/features/cstar_forge_natural_language_authorization.feature")

    assert "normal operator language" in feature
    assert "no machine challenge is exposed" in feature
    assert "forge_operator_authorization_required" in feature
    assert "zero or multiple eligible requests" in feature
    assert "cstar_forge_request cannot perform that profile transition" in feature


def test_forge_docs_match_bounded_six_role_runtime_contract() -> None:
    docs = tuple(
        _flat(_read(relative))
        for relative in (
            "docs/integrations/cstar-kernel-mcp.md",
            "docs/operations/corvus-forge-pipeline-playbook.md",
            "docs/operations/corvus-forge-skill-spec.md",
        )
    )
    role_plan = _read(
        ".agents/skills/corvus-forge/scripts/forge_role_plan.mjs"
    )

    for text in docs:
        assert "bounded-six-role-manifest-v1" in text
        assert "specifier -> coder -> cleaner -> architect -> hardener -> QA" in text
        assert "fresh sealed Hermes process" in text
        assert "exactly one fixed-host" in text
        assert "non-retrying MiniMax request" in text
        assert "forge_role_plan.mjs" in text
        assert "HERMES_BIN" in text
        assert "prepared, started, and terminal success/failure" in text
        assert "runtime-content digest" in text
        assert "terminal" in text and "trace" in text and "SHA-256" in text
        assert "not the genuine upstream SwarmForge six-pack" in text
        assert "tmux" in text and "Git-worktree" in text

    for text in docs:
        assert "specification_handoff_sha256" in text
        assert "immutable" in text and "specification" in text
        assert "hardender" in text and "hardener" in text
        assert "role-plan digest" in text and "runtime-content digest" in text
        assert "terminal trace" in text and (
            "mandatory" in text or "required" in text
        )
    assert "QA alone yields the final manifest" in docs[0]
    assert "QA alone" in docs[1] and "final exact-output manifest" in docs[1]
    assert "QA verifies" in docs[2] and "final exact-output manifest" in docs[2]
    assert "Zero retries means" in docs[0]
    assert "Zero retries means" in docs[1]
    assert "Zero retries means" in docs[2]
    assert "FORGE_ROLE_PLAN_ID = 'bounded-six-role-manifest-v1'" in role_plan
    for role in ("specifier", "coder", "cleaner", "architect", "hardener", "qa"):
        assert f"'{role}'" in role_plan


def test_forge_docs_preserve_legacy_v2_receipts_through_exact_sidecars() -> None:
    docs = tuple(
        _flat(_read(relative))
        for relative in (
            "docs/integrations/cstar-kernel-mcp.md",
            "docs/operations/corvus-forge-pipeline-playbook.md",
            "docs/operations/corvus-forge-skill-spec.md",
        )
    )
    for text in docs:
        assert "cstar.forge_request.v2" in text
        assert "cstar.forge_legacy_v2_execution_grant.v1" in text
        assert "CSTAR_FORGE_AUTHORIZE v2-compat-v1" in text
        assert "compatibility_manifest_sha256" in text
        assert "synthetic_only" in text
        assert "requester-lineage" in text
        assert "third root thread" in text
        assert "not" in text and "reissued" in text
        assert "59803dadb38e0e09d5357d749452036e4a82ae60" in text
        assert "no upstream source" in text.lower()

    provenance = _flat(
        _read(".agents/skills/corvus-forge/runtime/PROVENANCE.md")
    )
    assert "https://github.com/unclebob/swarm-forge" in provenance
    assert "design inspiration" in provenance
    assert "no vendoring" in provenance


def test_agents_points_to_goal_driven_daily_bootstrap_without_stale_authority() -> None:
    agents = _read("AGENTS.md")
    bootstrap = _read("docs/operations/cstar-goal-driven-daily-bootstrap.md")
    flat_bootstrap = _flat(bootstrap)

    assert "docs/operations/cstar-goal-driven-daily-bootstrap.md" in agents
    assert "Registries and observed runtime are evidence" in agents
    assert "PMTs are project-scoped information repositories only" in agents
    assert "Never invent a Gungnir" in agents
    assert "PMTs are durable project knowledge and review authorities" not in agents
    assert "Registry and runtime contracts outrank prose" not in agents

    for required in (
        "operator explicitly resumes it",
        "host exposes no resume transition",
        "hermes update --check",
        "hermes update --backup --yes",
        "auto-stash",
        "actual_model: null",
        "model_source: unreported",
        "restart gate",
        "drift is informational, not a red gate",
        "Do not rerun Hermes or Codex update checks",
    ):
        assert required in flat_bootstrap


def test_daily_bootstrap_preserves_git_and_runtime_dispatch_gates() -> None:
    bootstrap = _read("docs/operations/cstar-goal-driven-daily-bootstrap.md")
    feature = _read("tests/features/cstar_goal_driven_daily_bootstrap.feature")

    for text in (bootstrap, feature):
        assert "operator-gated" in text
        assert "Routine Node" in text and "bootstrap" in text
    assert "exact adapter inventory is empty" in bootstrap
    assert "does not write an environment value or file" in bootstrap
    assert "Durable lifecycle changes require" in bootstrap
    assert "registers no legacy adapter" in feature
    assert "dispatches no host-governor swarm" in feature


def test_ci_checks_checked_in_distributions_before_release_generation() -> None:
    workflow = _read(".github/workflows/ci.yml")
    validation_step = workflow.split(
        "- name: Validate Generated Distribution Artifacts", 1
    )[1].split("- name:", 1)[0]

    assert "node-version-file: .nvmrc" in workflow
    assert "npm run validate:distributions" in validation_step
    assert "npm run build:distributions" not in validation_step


def test_kernel_docs_separate_code_control_and_forge_readiness() -> None:
    kernel = _flat(_read("docs/integrations/cstar-kernel-mcp.md"))
    boundary = _flat(
        _read("docs/operations/cstar-kernel-code-control-root-boundary.md")
    )
    feature = _flat(_read("tests/features/cstar_kernel_code_control_root.feature"))

    for text in (kernel, boundary, feature):
        assert "CODE_ROOT" in text or "code root" in text
        assert "CONTROL_ROOT" in text or "control root" in text
        assert "Forge readiness" in text
    for required in (
        "creates no replacement Hall",
        "PathRegistry",
        "Direct TypeScript server launch",
        "dependency tree matching the checked-in lock",
        "separately authorized installation action",
        "intent grammar comes from the code-root registry",
    ):
        assert required in boundary


def test_host_goal_resume_is_append_only_and_continuity_only() -> None:
    bootstrap = _flat(_read("docs/operations/cstar-goal-driven-daily-bootstrap.md"))
    feature = _read("tests/features/cstar_host_goal_resume.feature")
    kernel_doc = _flat(_read("docs/integrations/cstar-kernel-mcp.md"))

    for required in (
        "cstar_goal_resume", "cstar.host_goal_resume.v2", "cstar.host_get_goal_projection.v1",
        "cstar.host_goal_snapshot.v1", "request receipt id and request SHA-256 as the only request lineage fields",
        "continuity_only", "host status remains `blocked`", "same canonical root thread",
        "does not need fresh repair wording", "liveness evidence only", "revocation",
        "protected actions", "scope expansion", "different target or goal", "tokensUsed",
        "timeUsedSeconds", "raw objective", "raw operator/current-turn text",
        "forge_goal_resume_v1_historical_only", "using only this safe payload",
    ):
        assert required in bootstrap
    for required in (
        "cstar.host_goal_resume.v2", "cstar.host_get_goal_projection.v1",
        "cstar.host_goal_snapshot.v1", "continuity_only", "raw operator text",
        "exactly one v2 coordination event exists", "no resume event is inserted",
        "forge_goal_resume_v1_historical_only",
    ):
        assert required in feature
    for required in (
        "optional router-supplied", "goal_resume_id", "goal-resume-v2:<64 lowercase hex>",
        "goal-resume:<64 lowercase hex>", "forge_goal_resume_v1_historical_only",
        "Operators must not author or paste bead ids", "decision ids",
        "legacy private v2 Forge adapter", "current Codex-host state-only Luna handoff",
        "host job/request handoff", "zero provider calls", "network requests", "spend",
        "Luna execution in CStar", "liveness and revocation input only",
    ):
        assert required in kernel_doc
    for stale in ("Public inputs are `forge_request_receipt_id`, `request_sha256`.", "A later root-user turn can only retrieve an already durable attempt"):
        assert stale not in kernel_doc


def test_persona_context_is_status_only_with_isolated_bounded_reader() -> None:
    agents = _read("AGENTS.md")
    kernel_doc = _read("docs/integrations/cstar-kernel-mcp.md")
    boundary_doc = _read("docs/integrations/safe_persona_reader.md")
    feature = _read("tests/features/safe_persona_reader.feature")

    assert "cstar_status" in agents
    assert "Never read or print `.agents/config.json`" in agents
    for text in (kernel_doc, boundary_doc, feature):
        assert "cstar_status" in text
    assert "there is no active persona default" in _flat(kernel_doc).lower()
    assert "system.persona" in boundary_doc
    assert "scripts/read_active_persona.py" in boundary_doc
    assert "bounded_config_projection" in kernel_doc
    assert "build_run_repair" in feature
    assert "secure_harden" in feature
    flattened_kernel_doc = _flat(kernel_doc)
    for source in ("Bootstrap rows", "legacy migrations", "document ingestion", "profile digests", "SessionStart hooks"):
        assert source in flattened_kernel_doc
    assert "omit persona context" in _flat(boundary_doc)
    assert "raw configuration" in feature

    claude_pointer = _read("docs/integrations/CLAUDE.qmd")
    assert "cstar_status" in claude_pointer
    assert "BEFORE ANY RESPONSE" not in claude_pointer
    assert "READ THIS FIRST" not in claude_pointer
    assert "Do not ask for permission" not in claude_pointer
    assert "MUST execute" not in claude_pointer
    assert "O.D.I.N. means build-run-repair" in claude_pointer
    assert "A.L.F.R.E.D. means secure-harden" in claude_pointer


def test_gemini_pointer_contains_no_persona_or_state_snapshot() -> None:
    pointer = _read("docs/integrations/GEMINI.qmd")

    assert "cstar_status" in pointer
    assert "cstar_handoff" in pointer
    assert "build-run-repair" in pointer
    assert "secure-harden" in pointer
    assert "grants no execution authority" in pointer
    assert "has no default" in pointer
    for stale in (
        "Active Mind",
        "O.D.I.N.",
        "ALFRED",
        "C:\\Users\\",
        "auto-remediate",
        "94.7%",
        "Code Sentinel**: PASS",
        "Operational Buffer**: STABLE",
    ):
        assert stale not in pointer


def test_retired_skill_scout_grants_no_research_or_write_authority() -> None:
    registry = json.loads(_read(".agents/skill_registry.json"))
    pointer = _read("src/skills/local/skill-scout/SKILL.qmd")
    feature = _read("tests/features/cstar_retired_skill_scout.feature")

    assert "skill-scout" not in registry["entries"]
    for required in (
        "not registered",
        "fail closed",
        "`cstar_researcher_request`",
        "`cstar_forge_request`",
        "independent-validation",
    ):
        assert required in pointer
    for forbidden in (
        "search_web",
        ".agents/skills/<tool-name>",
        "sv_engine.py",
        "Just search",
        "Just create",
        "confidence < 0.60",
    ):
        assert forbidden not in pointer
    assert "no activation or execution surface" in feature
    assert "authorized Researcher lane" in feature
    assert "durable Forge lifecycle" in feature


def test_runtime_failure_requires_a_fresh_operator_invocation() -> None:
    contract = _read("docs/integrations/host_native_skill_contract.md")
    feature = _read("tests/features/runtime_failure_authority.feature")

    for required in (
        "executes exactly once",
        "operator_action_required: true",
        "automatic_recovery_attempted: false",
        "fresh top-level invocation",
        "allow_kernel_fallback",
    ):
        assert required in contract
    assert "no host provider or governor is invoked" in feature
    assert "no kernel fallback executes" in feature


def test_runtime_provider_attempts_require_exact_identity_and_timeout_ownership() -> None:
    contract = _flat(_read("docs/integrations/host_native_skill_contract.md"))
    feature = _flat(_read("tests/features/cstar_runtime_provider_attempt_identity.feature"))

    for required in (
        "binds both provider and execution surface",
        "all five attempt fields",
        "execution_dispatched=unreported",
        "Structured error evidence outranks legacy message text",
        "receives an `AbortSignal`",
        "waits for that runner to settle",
    ):
        assert required in contract
    assert "only that provider and surface may be dispatched" in feature
    assert "missing provider, surface, or dispatch evidence is not invented" in feature
    assert "no retry or alternate surface runs" in feature
