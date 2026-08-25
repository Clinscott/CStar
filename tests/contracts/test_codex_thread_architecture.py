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
        "CStar is the axle rather than a PMT or worker spoke.",
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
        "CoS receives User intent and records the goal as a bounded CStar-tracked decision, proposal, or bead.",
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
