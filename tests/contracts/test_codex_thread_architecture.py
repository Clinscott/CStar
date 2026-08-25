from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOCTRINE = PROJECT_ROOT / "docs" / "architecture" / "cos-pmt-thread-architecture.md"
FEATURE = PROJECT_ROOT / "tests" / "features" / "cos_pmt_thread_architecture.feature"


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _normalized(path: Path) -> str:
    return " ".join(_text(path).split())


def test_thread_architecture_doctrine_exists():
    doctrine = _normalized(DOCTRINE)
    feature = _normalized(FEATURE)

    assert "Thread topology is part of the system architecture" in doctrine
    assert "Feature: CoS and project-context thread architecture" in feature


def test_cstar_researcher_forge_and_corvuseye_have_separate_roles():
    doctrine = _normalized(DOCTRINE)

    required = [
        "CStar is only the deterministic state manager for Corvus estate work.",
        "CoS in Codex is the orchestrator and supervisor/delegator.",
        "CStar is the axle rather than a PMT or worker spoke, but it is only the deterministic state manager.",
        "Researcher gathers evidence through authorized source lanes.",
        "Corvus Forge builds implementation through the durable",
        "CorvusEye is the independent evaluation and red-team spoke.",
    ]

    for phrase in required:
        assert phrase in doctrine


def test_cos_user_pmt_and_mm_authority_boundaries_are_explicit():
    doctrine = _normalized(DOCTRINE)

    required = [
        "The User authorizes high-order direction and red-gated instructions.",
        "CoS is the estate overseer and operator-facing decision surface.",
        "PMTs are project-scoped information repositories only.",
        "A PMT grants no ownership, execution, review, approval, routing, or monitoring",
        "A missing or stale mapped PMT is a freshness gap, not an execution gate",
        "When an in-scope project has a mapped PMT, CoS must read one bounded context packet.",
        "Luna for routine retrieval, Terra for conflicting-context synthesis, and Sol for high-stakes",
        "requested and actual identity separately; absent a reported identity, actual is `unreported`.",
        "MM is legacy and has no active estate-routing, synthesis, ownership, or relay",
    ]

    for phrase in required:
        assert phrase in doctrine


def test_goal_lifecycle_and_red_gates_are_contractual():
    doctrine = _normalized(DOCTRINE)

    required = [
        "CoS receives User intent and records the requested work as a bounded CStar-tracked decision, proposal, or bead; this does not create a host goal.",
        "When waiting on a live worker or external state, CoS pauses rather than",
        "A PMT read is never the live worker and never blocks execution.",
        "PMT `STATE_UPDATE` after meaningful project work",
        "Red gates require explicit CoS/User authorization before execution:",
        "locked-holdout evaluation, hidden-label access, or tuning against sealed evaluation data;",
        "authority-model or execution-boundary changes;",
    ]

    for phrase in required:
        assert phrase in doctrine


def test_stale_pmt_ownership_and_mm_routing_are_declared_violations():
    doctrine = _normalized(DOCTRINE)

    required = [
        "grant a PMT ownership, execution, review, approval, routing, or monitoring",
        "make mapped PMT availability an execution or completion gate;",
        "restore MM as an active coordination or relay lane;",
        "let a producer perform an independent review required for its own gate.",
    ]

    for phrase in required:
        assert phrase in doctrine


def test_cos_delegation_and_workthread_contract_is_fail_closed():
    doctrine = _normalized(DOCTRINE)
    feature = _normalized(FEATURE)

    required = [
        "CoS must not implement, research, debug, edit source, run worker tests or validation, or silently take over failed worker work.",
        "A `workthread` is only a retained/resumable host-issued worker thread with stable lineage.",
        "CStar must not launch a workthread, agent, or provider",
        "requested_model",
        "requested_reasoning",
        "selector_status",
        "actual_identity",
        "actual_identity: unreported",
        "Selector absence or mismatch is a visible unsupported/blocked result",
        "never silently fall back",
        "gpt-5.6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "no numeric concurrency cap",
    ]

    for phrase in required:
        assert phrase in doctrine

    assert "6-normal" not in doctrine
    assert "8-burst" not in doctrine
    assert "CoS requests correction through the owning lane or records a durable successor repair" in feature
    assert "CoS works the issue" not in feature


def test_worker_owned_host_goals_reject_authority_and_goal_reuse():
    doctrine = _normalized(DOCTRINE)
    feature = _normalized(FEATURE)

    required = [
        "CoS owns no host goal",
        "CoS must never create, resume, update, pause, block, complete, or close a host goal",
        "Every substantive implementation, research, debug, or validation assignment",
        "owns exactly one bounded host goal",
        "exact CStar bead id, the decision, the target paths, and the checker contract",
        "Host-goal status is worker-local evidence, never CStar lifecycle authority",
        "Recoverable correction stays in the same retained workthread and the same host goal",
        "If a replacement worker is required, it receives a new host goal",
        "explicit bounded CStar handoff",
        "never inherits hidden host-goal state",
        "distinct validator owns a distinct validation goal",
        "never reuses the implementation goal",
        "Legacy CoS-held host goals remain paused and historical",
        "CStar has no generic host-goal surface",
    ]

    for phrase in required:
        assert phrase in doctrine

    assert "CoS creates a host goal" not in doctrine
    assert "replacement worker inherits hidden host-goal state" not in doctrine
    assert "validator reuses the implementation goal" not in doctrine
    assert "CoS owns no host goal" in feature
    assert "Host goals are worker-owned evidence" in feature
    assert "goal status is worker-local evidence, never CStar lifecycle truth" in feature
