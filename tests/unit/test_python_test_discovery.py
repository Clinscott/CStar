"""Keep every non-fixture Python test either maintained or explicitly quarantined."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TEST_ROOT = ROOT / "tests"
MAINTAINED_DIRS = {"contracts", "crucible", "empire_tests", "integration", "unit"}


def test_every_nonfixture_python_test_is_maintained_or_quarantined() -> None:
    uncovered: list[str] = []
    for path in TEST_ROOT.rglob("test_*.py"):
        relative = path.relative_to(TEST_ROOT)
        first = relative.parts[0]
        if first in {"fixtures", "quarantine"}:
            continue
        if len(relative.parts) == 1 or first in MAINTAINED_DIRS:
            continue
        uncovered.append(relative.as_posix())
    assert uncovered == []


def test_package_python_suite_names_every_maintained_family() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    script = str(package["scripts"]["test:python"])
    for token in (
        "tests/test_*.py",
        "tests/unit",
        "tests/integration",
        "tests/contracts",
        "tests/empire_tests",
        "tests/crucible",
    ):
        assert token in script
