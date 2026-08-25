"""Contract for the cross-platform dependency and Python CI boundary."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CI = ROOT / ".github" / "workflows" / "ci.yml"


def test_ci_uses_the_validated_lock_and_explicit_python_executable() -> None:
    workflow = CI.read_text(encoding="utf-8")

    assert "node-version: 22" in workflow
    assert "fail-fast: false" in workflow
    assert (
        "actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8"
        in workflow
    )
    assert not re.search(r"uses:\s*['\"]?actions/checkout@v", workflow)
    assert (
        "npm install --global npm@11.11.0 --ignore-scripts --no-audit --no-fund"
        in workflow
    )
    assert "npm ci --ignore-scripts --no-audit --no-fund" in workflow
    assert (
        "npm rebuild better-sqlite3 --foreground-scripts --no-audit --no-fund"
        in workflow
    )
    assert "npm_config_build_from_source: 'true'" in workflow
    assert workflow.index("npm ci --ignore-scripts") < workflow.index(
        "npm rebuild better-sqlite3"
    )
    assert "npm install --legacy-peer-deps" not in workflow
    assert "python -m pip install -r requirements.txt" in workflow
    assert "CSTAR_PYTHON_EXECUTABLE=" in workflow
    assert "sys.executable" in workflow
    assert ".venv/bin" not in workflow
    assert r".venv\\Scripts" not in workflow
