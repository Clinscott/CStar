from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOCTRINE = PROJECT_ROOT / "docs" / "architecture" / "cos-pmt-thread-architecture.md"
FEATURE = PROJECT_ROOT / "tests" / "features" / "cos_pmt_thread_architecture.feature"


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_information_repository_doctrine_exists():
    doctrine = _text(DOCTRINE)
    feature = _text(FEATURE)

    assert "CoS and Project Information-Repository Architecture" in doctrine
    assert "Feature: CoS and project information-repository architecture" in feature


def test_cos_is_the_active_estate_coordinator():
    doctrine = _text(DOCTRINE)

    required = [
        "CoS owns estate sequencing",
        "routing builds to Forge and research to Researcher",
        "returning red gates, spend/scope expansion, and authority conflicts to the",
        "compact state-update packets to project information repositories",
    ]

    for phrase in required:
        assert phrase in doctrine

def test_pmts_are_passive_information_repositories():
    doctrine = _text(DOCTRINE)

    required = [
        "PMTs are passive project information repositories.",
        "own execution, review, approval, routing, monitoring, or operator contact",
        "The repository stores the packet. It does not answer with an authoritative",
        "replace CStar lifecycle state",
    ]

    for phrase in required:
        assert phrase in doctrine


def test_mm_is_explicitly_legacy():
    doctrine = _text(DOCTRINE)

    assert "MM is retired from active estate routing." in doctrine
    assert "Historical MM threads and records are archival leads only." in doctrine
    assert "CoS directly handles" in doctrine


def test_forge_thread_fields_do_not_encode_pmt_authority():
    doctrine = _text(DOCTRINE)

    assert "state_update_thread_id" in doctrine
    assert "owner_pmt_thread_id" in doctrine
    assert "grants no ownership or review authority" in doctrine


def test_lifecycle_and_operator_gates_remain_cstar_backed():
    doctrine = _text(DOCTRINE)

    required = [
        "CoS records or resumes the bounded CStar bead/decision.",
        "Delivery artifacts remain evidence until independent validation is recorded.",
        "Explicit operator authorization remains required for:",
        "spend beyond the recorded request or any retry not already authorized",
        "gives a PMT or legacy MM any authority",
    ]

    for phrase in required:
        assert phrase in doctrine
