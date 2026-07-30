"""Contract for the cross-platform dependency and Python CI boundary."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CI = ROOT / ".github" / "workflows" / "ci.yml"
PACKAGE = ROOT / "package.json"
PORTABLE_HOST_NODE_TESTS = [
    "tests/node/cli_bootstrap.test.ts",
    "tests/unit/cstar-kernel-mcp/test_augury_bead_result.test.ts",
    "tests/unit/cstar-kernel-mcp/test_codex_request_identity.test.ts",
    "tests/unit/cstar-kernel-mcp/test_codex_session_locator_boundary.test.ts",
    "tests/unit/cstar-kernel-mcp/test_forge_adapter_runtime_portability.test.ts",
    "tests/unit/cstar-kernel-mcp/test_operator_authorization.test.ts",
    "tests/unit/cstar-kernel-mcp/test_operator_authorization_scope_binding.test.ts",
    "tests/unit/test_distribution_manifests.test.ts",
    "tests/unit/test_hall_store_path_authority.test.ts",
    "tests/unit/test_path_registry.test.ts",
    "tests/unit/test_persona_runtime_neutrality.test.ts",
    "tests/unit/test_release_archives.test.ts",
    "tests/unit/test_release_bundles.test.ts",
    "tests/unit/test_repository_verification_authority.test.ts",
]
PYTHON_SUITE = (
    "node scripts/run-python.mjs -m pytest tests/test_*.py tests/unit "
    "tests/integration tests/contracts tests/empire_tests tests/crucible"
)


def test_ci_uses_the_validated_lock_and_explicit_python_executable() -> None:
    workflow = CI.read_text(encoding="utf-8")

    assert "node-version: 22" in workflow
    assert "fail-fast: false" in workflow
    assert re.findall(
        r"^\s+os:\s*\[(.*?)\]\s*$",
        workflow,
        flags=re.MULTILINE,
    ) == ["ubuntu-latest, windows-latest, macos-latest"]
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
    test_start = workflow.index(
        "- name: Test complete unified suite (Node & Python, Linux)"
    )
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


def test_ci_keeps_complete_unified_coverage_on_linux() -> None:
    workflow = CI.read_text(encoding="utf-8")
    linux_start = workflow.index(
        "- name: Test complete unified suite (Node & Python, Linux)"
    )
    portable_start = workflow.index(
        "- name: Test portable-host contracts (Node)"
    )
    linux_step = workflow[linux_start:portable_start]

    assert linux_step.strip().splitlines() == [
        "- name: Test complete unified suite (Node & Python, Linux)",
        "      if: runner.os == 'Linux'",
        "      run: npm test",
    ]


def test_ci_routes_the_exact_serial_node_suite_to_both_portable_hosts() -> None:
    workflow = CI.read_text(encoding="utf-8")
    flag = "CSTAR_HALL_STORE_WINDOWS_CI_TEST_ONLY"
    portable_start = workflow.index(
        "- name: Test portable-host contracts (Node)"
    )
    python_start = workflow.index(
        "- name: Test configured Python suite (portable hosts)"
    )
    portable_step = workflow[portable_start:python_start]
    command_start = portable_step.index("      run: >-\n") + len(
        "      run: >-\n"
    )
    command_end = portable_step.index("      env:\n")
    command = " ".join(
        line.strip()
        for line in portable_step[command_start:command_end].splitlines()
    )
    expected_command = " ".join(
        [
            "node scripts/run-tsx.mjs --test --test-concurrency=1",
            *PORTABLE_HOST_NODE_TESTS,
        ]
    )

    assert "if: runner.os != 'Linux'" in portable_step
    assert command == expected_command
    assert portable_step.rstrip().endswith(
        "      env:\n"
        "        CSTAR_HALL_STORE_WINDOWS_CI_TEST_ONLY: "
        "${{ runner.os == 'Windows' && '1' || '0' }}"
    )
    assert workflow.count(flag) == 1


def test_ci_runs_the_configured_python_suite_on_portable_hosts() -> None:
    workflow = CI.read_text(encoding="utf-8")
    package = json.loads(PACKAGE.read_text(encoding="utf-8"))
    python_start = workflow.index(
        "- name: Test configured Python suite (portable hosts)"
    )
    python_step = workflow[python_start:]

    assert python_step.strip().splitlines() == [
        "- name: Test configured Python suite (portable hosts)",
        "      if: runner.os != 'Linux'",
        "      run: npm run test:python",
    ]
    assert package["scripts"]["test:python"] == PYTHON_SUITE
    assert "tests/quarantine" not in PYTHON_SUITE
