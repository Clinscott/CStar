"""Focused contracts for retired CStar surfaces and authority pointers."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def _flat(text: str) -> str:
    return " ".join(text.split())


def test_retired_autonomous_weaves_are_absent_from_bootstrap_and_fail_closed() -> None:
    bootstrap = _read("src/node/core/runtime/bootstrap.ts")
    orchestrate = _read("src/node/core/runtime/weaves/orchestrate.ts")
    governor = _read("src/node/core/runtime/weaves/host_governor.ts")
    feature = _flat(_read("tests/features/cstar_durable_work_routing_and_recovery.feature"))

    assert "new OrchestrateWeave" not in bootstrap
    assert "new HostGovernorWeave" not in bootstrap
    assert "legacy_orchestrate_weave_retired_use_cstar_kernel" in orchestrate
    assert "legacy_host_governor_retired_use_cstar_kernel" in governor
    assert "hall_mutation_started: false" in orchestrate
    assert "hall_mutation_started: false" in governor
    assert "exact registered adapter inventory is empty" in feature
    assert "Legacy dynamic CLI discovery is a tombstone" in feature
    assert "Durable lifecycle transitions are kernel-only" in feature


def test_current_catalogs_and_docs_omit_retired_sovereign_entrypoints() -> None:
    current_surfaces = (
        ".agents/skill_registry.json",
        "AGENTS.md",
        "AGENTS.qmd",
        "docs/architecture/SKILL_REGISTRY.md",
        "docs/architecture/WEAVES.md",
        "docs/integrations/cstar-kernel-mcp.md",
        "docs/integrations/host_native_skill_contract.md",
        "docs/operations/corvus-forge-pipeline-playbook.md",
        "docs/operations/cstar-goal-driven-daily-bootstrap.md",
    )
    retired_names = (
        "sv_engine.py",
        "wrap_it_up.py",
        "benchmark_engine.py",
        "latency_check.py",
        "audit_dialogue.py",
        "SovereignEngine",
        "SovereignWrapper",
        "SovereignForge",
        "SovereignLifecycle",
    )

    for relative in current_surfaces:
        text = _read(relative)
        for retired in retired_names:
            assert retired not in text, (relative, retired)


def test_retired_python_secret_bootstrap_contract_is_fail_closed() -> None:
    contract = _flat(
        _read("docs/operations/retired-python-secret-bootstrap-surfaces.md")
    )
    feature = _flat(
        _read("tests/features/cstar_retired_python_secret_bootstrap_surfaces.feature")
    )

    for required in (
        "legacy_python_bootstrap_retired_use_cstar_kernel",
        "legacy_python_source_tools_retired_use_authorized_researcher",
        "legacy_secret_vault_provider_tools_retired_use_supported_surfaces",
        "Import, help, and readiness inspection remain passive",
        "pure in-memory transform over an explicit mapping",
        "do not grant Researcher, provider, secret, installation, restart, activation, or deployment authority",
    ):
        assert required in contract

    for required in (
        "reads no dotenv config secret quota or live source",
        "starts no provider network process Hall state or callback effect",
        "no key is generated rotated disclosed or persisted",
        "no vault environment config or filesystem fallback is attempted",
    ):
        assert required in feature


def test_legacy_authority_pointer_matches_the_kernel_only_boundary() -> None:
    pointer = _read("AGENTS.qmd")
    flat_pointer = _flat(pointer)
    weave_doc = _read("docs/architecture/WEAVES.md")
    flat_weave_doc = _flat(weave_doc)

    for required in (
        "compatibility pointer only",
        "PMTs are project-scoped information repositories only",
        "MM has no active routing role",
        "does not create lifecycle beads",
        "fail closed before Hall, state, provider, process",
    ):
        assert required in flat_pointer

    for stale in (
        "TRACE SELECTION GATE",
        "Every agentic response MUST begin",
        "PMT threads are durable project knowledge and review authorities",
        "automatically create or claim a Bead ID for every dispatch",
        "Gungnir Verdict:",
    ):
        assert stale not in pointer

    assert "exact empty adapter inventory" in flat_weave_doc
    assert "direct `registerAdapter` calls cannot restore" in flat_weave_doc
    assert "Direct `DynamicCommandAdapter`, `UniversalAdapter`, and `PythonSkillAdapter`" in weave_doc
    assert "all five effect flags false" in flat_weave_doc
    assert "Durable lifecycle transitions occur only" in flat_weave_doc
