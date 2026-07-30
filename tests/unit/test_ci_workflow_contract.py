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


def test_ci_prepares_a_sealed_forge_runtime_only_for_linux_tests() -> None:
    workflow = CI.read_text(encoding="utf-8")
    fixture_start = workflow.index("- name: Prepare sealed Forge test runtime")
    test_start = workflow.index("- name: Test Unified Suite (Node & Python)")
    fixture = workflow[fixture_start:test_start]

    assert "if: runner.os == 'Linux'" in fixture
    assert 'sealed_runtime_dir="$RUNNER_TEMP/cstar-forge-runtime"' in fixture
    assert 'install -d -m 0700 "$sealed_runtime_dir"' in fixture
    assert (
        'install -m 0755 "$(command -v node)" "$sealed_runtime_dir/node"'
        in fixture
    )
    assert 'echo "$sealed_runtime_dir" >> "$GITHUB_PATH"' in fixture
    assert (
        "/proc/sys/kernel/apparmor_restrict_unprivileged_userns"
        in fixture
    )
    assert (
        "sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0"
        in fixture
    )


def test_ci_scopes_the_hall_store_fixture_to_the_windows_test_step() -> None:
    workflow = CI.read_text(encoding="utf-8")
    flag = "CSTAR_HALL_STORE_WINDOWS_CI_TEST_ONLY"
    default_test_start = workflow.index(
        "- name: Test Unified Suite (Node & Python)\n"
    )
    windows_test_start = workflow.index(
        "- name: Test Unified Suite (Node & Python, Windows Hall fixture)"
    )
    default_test = workflow[default_test_start:windows_test_start]
    windows_test = workflow[windows_test_start:]

    assert "if: runner.os != 'Windows'" in default_test
    assert "run: npm test" in default_test
    assert flag not in default_test
    assert "if: runner.os == 'Windows'" in windows_test
    assert "run: npm test" in windows_test
    assert f"{flag}: '1'" in windows_test
    assert workflow.count(flag) == 1
