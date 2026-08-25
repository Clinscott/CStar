"""Documentation contract for retired Python ancillary surfaces."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / "docs" / "operations" / "retired-python-ancillary-surfaces.md"


def test_retirement_document_names_supported_routes_and_prohibitions():
    text = DOC.read_text(encoding="utf-8")
    for required in (
        "CStar kernel tools",
        "Researcher",
        "durable CStar Forge request and execute path",
        "supported host skill installation surface",
        "stable retirement error",
        "not current authority",
    ):
        assert required in text
    for prohibited in (
        "credentials",
        "network clients",
        "subprocesses",
        "mutate source",
        "write Hall state",
        "perform Git",
    ):
        assert prohibited in text


def test_active_contract_marks_each_family_retired():
    text = DOC.read_text(encoding="utf-8")
    for family in (
        "install_skill.py",
        "skill_forge.py",
        "Wild Hunt",
        "Evolution Watch",
        "Synapse",
        "Archive Consolidator",
        "Perimeter Sweep",
        "Network Watcher",
        "Overwatch",
        "Bifrost",
    ):
        assert family in text
