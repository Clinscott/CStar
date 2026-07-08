from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOCTRINE = PROJECT_ROOT / "docs" / "architecture" / "cos-pmt-thread-architecture.md"
FEATURE = PROJECT_ROOT / "tests" / "features" / "cos_pmt_thread_architecture.feature"


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_thread_architecture_doctrine_exists():
    doctrine = _text(DOCTRINE)
    feature = _text(FEATURE)

    assert "Thread topology is part of the system architecture" in doctrine
    assert "Feature: CoS and PMT thread architecture" in feature


def test_cstar_console_researcher_and_forge_have_separate_owners():
    doctrine = _text(DOCTRINE)

    required = [
        "The CStar Control Plane PMT owns CStar and cstar-console control-plane surfaces.",
        "It must not also own Researcher execution or Corvus Forge implementation work.",
        "The Researcher PMT owns research and evidence production.",
        "The Corvus Forge PMT owns build and implementation delivery.",
        "The CorvusEye Review PMT is an independent review and audit lane.",
    ]

    for phrase in required:
        assert phrase in doctrine


def test_cos_user_and_mm_authority_boundaries_are_explicit():
    doctrine = _text(DOCTRINE)

    required = [
        "The User authorizes high-order direction and red-gated instructions.",
        "CoS is the estate overseer and operator-facing decision surface.",
        "CoS does not own routine implementation",
        "MM is an estate synthesis and coordination lane, not a relay requirement for every packet.",
        "Direct CoS-to-pinned-PMT routing is valid",
    ]

    for phrase in required:
        assert phrase in doctrine


def test_goal_lifecycle_and_red_gates_are_contractual():
    doctrine = _text(DOCTRINE)

    required = [
        "CoS receives User intent and records the goal as a bounded CStar-tracked decision, proposal, or bead.",
        "While a PMT is running, CoS keeps the goal parked or blocked rather than polling continuously.",
        "Red gates require explicit CoS/User authorization before execution:",
        "locked-holdout evaluation, hidden-label access, or tuning against sealed evaluation data;",
        "authority-model changes, ownership-boundary changes, or PMT responsibility merges;",
    ]

    for phrase in required:
        assert phrase in doctrine


def test_combined_pmt_domains_are_declared_violations():
    doctrine = _text(DOCTRINE)

    required = [
        "CStar Control Plane PMT plus Researcher PMT is a violation;",
        "CStar Control Plane PMT plus Corvus Forge PMT is a violation;",
        "Researcher PMT plus Corvus Forge PMT is a violation;",
        "producer PMT plus independent review PMT is a violation",
    ]

    for phrase in required:
        assert phrase in doctrine
