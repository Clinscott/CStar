"""Contract for the cross-platform dependency and Python CI boundary."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CI = ROOT / ".github" / "workflows" / "ci.yml"
PACKAGE = ROOT / "package.json"
MACOS_NODE_TESTS = [
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
WINDOWS_NODE_TESTS = [
    "tests/node/cli_bootstrap.test.ts",
    "tests/unit/cstar-kernel-mcp/test_forge_adapter_runtime_portability.test.ts",
    "tests/unit/test_distribution_manifests.test.ts",
    "tests/unit/test_path_registry.test.ts",
    "tests/unit/test_persona_runtime_neutrality.test.ts",
    "tests/unit/test_release_archives.test.ts",
    "tests/unit/test_release_bundles.test.ts",
]
PYTHON_SUITE = (
    "node scripts/run-python.mjs -m pytest tests/test_*.py tests/unit "
    "tests/integration tests/contracts tests/empire_tests tests/crucible"
)
TEMP_ENV_LINES = [
    "      env:",
    "        TEMP: ${{ runner.temp }}",
    "        TMP: ${{ runner.temp }}",
    "        TMPDIR: ${{ runner.temp }}",
]


def test_ci_uses_the_validated_lock_and_explicit_python_executable() -> None:
    workflow = CI.read_text(encoding="utf-8")

    assert "node-version-file: .nvmrc" in workflow
    assert "node-version: 22" not in workflow
    assert "npm run validate:runtime" in workflow
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


def test_ci_binds_all_temp_variables_to_the_runner_owned_root() -> None:
    workflow = CI.read_text(encoding="utf-8")
    job_start = workflow.index("  build:\n")
    strategy_start = workflow.index("    strategy:\n", job_start)
    job_preamble = workflow[job_start:strategy_start]
    macos_start = workflow.index(
        "- name: Test broad portable contracts (Node, macOS)"
    )
    windows_start = workflow.index(
        "- name: Test native Windows compatibility subset "
        "(Node, no authority/runtime)"
    )
    python_start = workflow.index(
        "- name: Test configured Python suite (portable hosts)"
    )
    portable_steps = [
        workflow[macos_start:windows_start],
        workflow[windows_start:python_start],
        workflow[python_start:],
    ]

    assert job_preamble.strip().splitlines() == [
        "build:",
        "    runs-on: ${{ matrix.os }}",
    ]
    assert "runner.temp" not in job_preamble
    for step in portable_steps:
        assert step.rstrip().splitlines()[-4:] == TEMP_ENV_LINES
    assert workflow.count("TEMP: ${{ runner.temp }}") == 3
    assert workflow.count("TMP: ${{ runner.temp }}") == 3
    assert workflow.count("TMPDIR: ${{ runner.temp }}") == 3


def test_ci_prepares_a_sealed_forge_runtime_only_for_linux_tests() -> None:
    workflow = CI.read_text(encoding="utf-8")
    fixture_start = workflow.index("- name: Prepare sealed Forge test runtime")
    test_start = workflow.index(
        "- name: Test complete authority/runtime suite (Node & Python, Linux/WSL)"
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
        "- name: Test complete authority/runtime suite (Node & Python, Linux/WSL)"
    )
    macos_start = workflow.index(
        "- name: Test broad portable contracts (Node, macOS)"
    )
    linux_step = workflow[linux_start:macos_start]

    assert linux_step.strip().splitlines() == [
        "- name: Test complete authority/runtime suite (Node & Python, Linux/WSL)",
        "      if: runner.os == 'Linux'",
        "      run: npm test",
    ]


def test_ci_routes_the_exact_serial_node_suite_to_macos() -> None:
    workflow = CI.read_text(encoding="utf-8")
    macos_start = workflow.index(
        "- name: Test broad portable contracts (Node, macOS)"
    )
    windows_start = workflow.index(
        "- name: Test native Windows compatibility subset "
        "(Node, no authority/runtime)"
    )
    macos_step = workflow[macos_start:windows_start]
    command_start = macos_step.index("      run: >-\n") + len(
        "      run: >-\n"
    )
    command_end = macos_step.index("      env:\n")
    command = " ".join(
        line.strip()
        for line in macos_step[command_start:command_end].strip().splitlines()
    )
    expected_command = " ".join(
        [
            "node scripts/run-tsx.mjs --test --test-concurrency=1",
            *MACOS_NODE_TESTS,
        ]
    )

    assert "if: runner.os == 'macOS'" in macos_step
    assert command == expected_command


def test_ci_routes_only_the_exact_compatibility_subset_to_windows() -> None:
    workflow = CI.read_text(encoding="utf-8")
    windows_start = workflow.index(
        "- name: Test native Windows compatibility subset "
        "(Node, no authority/runtime)"
    )
    python_start = workflow.index(
        "- name: Test configured Python suite (portable hosts)"
    )
    windows_step = workflow[windows_start:python_start]
    command_start = windows_step.index("      run: >-\n") + len(
        "      run: >-\n"
    )
    command_end = windows_step.index("      env:\n")
    command = " ".join(
        line.strip()
        for line in windows_step[command_start:command_end].strip().splitlines()
    )
    expected_command = " ".join(
        [
            "node scripts/run-tsx.mjs --test --test-concurrency=1",
            *WINDOWS_NODE_TESTS,
        ]
    )

    assert "if: runner.os == 'Windows'" in windows_step
    assert command == expected_command
    assert "CSTAR_HALL_STORE_WINDOWS_CI_TEST_ONLY" not in workflow


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
        *TEMP_ENV_LINES,
    ]
    assert package["scripts"]["test:python"] == PYTHON_SUITE
    assert "tests/quarantine" not in PYTHON_SUITE
