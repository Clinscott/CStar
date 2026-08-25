from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
RUNTIME_POLICY = json.loads((ROOT / "runtime-policy.json").read_text(encoding="utf-8"))
SCRIPTS = ROOT / ".agents" / "skills" / "cstar-sprt-autoresearcher" / "scripts"
RUNNER = SCRIPTS / "run_cstar_workflow_sprt.py"
sys.path.insert(0, str(SCRIPTS))

import cstar_workflow_sprt_core as core  # noqa: E402
import run_cstar_workflow_sprt as runner  # noqa: E402


STAGES = core.PROTECTED_STAGES
TEMP_ENV = {
    "PYTHONDONTWRITEBYTECODE": "1",
    "TMPDIR": "/tmp",
    "TEMP": "/tmp",
    "TMP": "/tmp",
}
FIXTURE_SCRIPT = """\
import fs from 'node:fs';

const phase = process.env.CSTAR_SPRT_PHASE === 'stage_pass' ? 'stage' : 'trial';
const mode = fs.readFileSync(`${phase}-mode.txt`, 'utf8').trim();
if (mode === 'timeout') await new Promise((resolve) => setTimeout(resolve, 2000));
if (mode === 'malformed') {
  console.log('not TAP');
  process.exit(0);
}
console.log('TAP version 13');
if (mode !== 'missing') {
  for (const stage of [
    'request', 'authorization', 'synthetic_execute', 'delivered_unverified',
    'independent_validation_record_result', 'closeout_terminal'
  ]) console.log(`# cstar-stage: ${stage}`);
}
if (mode === 'skip') {
  console.log('ok 1 - synthetic lifecycle # SKIP protected stage unavailable');
  console.log('1..1');
  console.log('# tests 1\\n# pass 0\\n# fail 0\\n# skipped 1\\n# todo 0\\n# cancelled 0');
} else if (mode === 'fail') {
  console.log('not ok 1 - synthetic lifecycle');
  console.log('1..1');
  console.log('# tests 1\\n# pass 0\\n# fail 1\\n# skipped 0\\n# todo 0\\n# cancelled 0');
  process.exitCode = 1;
} else {
  console.log('ok 1 - synthetic lifecycle');
  console.log('1..1');
  console.log('# tests 1\\n# pass 1\\n# fail 0\\n# skipped 0\\n# todo 0\\n# cancelled 0');
}
"""
FAKE_DATABASE = """\
class Database {
  constructor(name) { if (name !== ':memory:') throw new Error('memory only'); }
  prepare() { return { get() { return { value: 1 }; } }; }
  close() {}
}
module.exports = Database;
"""


def _checker(
    tmp_path: Path,
    *,
    stage_mode: str = "pass",
    trial_mode: str = "pass",
    compatible_native: bool = True,
) -> tuple[Path, Path]:
    checker = tmp_path / "checker"
    (checker / "scripts").mkdir(parents=True, exist_ok=True)
    (checker / "runtime-policy.json").write_text(
        (ROOT / "runtime-policy.json").read_text(encoding="utf-8"), encoding="utf-8",
    )
    (checker / "scripts" / "run-tsx.mjs").write_text(FIXTURE_SCRIPT, encoding="utf-8")
    for module in core.FOCUSED_LIFECYCLE_MODULES:
        path = checker / module
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("// fixed synthetic module fixture\n", encoding="utf-8")
    (checker / "stage-mode.txt").write_text(f"{stage_mode}\n", encoding="utf-8")
    (checker / "trial-mode.txt").write_text(f"{trial_mode}\n", encoding="utf-8")
    if compatible_native:
        dependency = checker / "node_modules" / RUNTIME_POLICY["native"]["dependency"]
        dependency.mkdir(parents=True, exist_ok=True)
        (dependency / "index.js").write_text(FAKE_DATABASE, encoding="utf-8")
        (dependency / "package.json").write_text(
            json.dumps({"name": RUNTIME_POLICY["native"]["dependency"], "version": RUNTIME_POLICY["native"]["version"], "main": "index.js"}),
            encoding="utf-8",
        )
    candidate = checker / "candidate.ts"
    candidate.write_text("candidate-v1\n", encoding="utf-8")
    return checker, candidate


def _invoke(
    tmp_path: Path,
    *,
    stage_mode: str = "pass",
    trial_mode: str = "pass",
    compatible_native: bool = True,
    max_trials: int = 11,
    timeout_seconds: float = 1.0,
    total_wall_seconds: float = 30.0,
    output_dir: Path | None = None,
    extra_args: list[str] | None = None,
) -> tuple[subprocess.CompletedProcess[str], dict[str, object] | None]:
    checker, candidate = _checker(
        tmp_path, stage_mode=stage_mode, trial_mode=trial_mode,
        compatible_native=compatible_native,
    )
    command = [
        sys.executable, str(RUNNER), "--checker-root", str(checker),
        "--candidate-source", str(candidate), "--max-trials", str(max_trials),
        "--timeout-seconds", str(timeout_seconds),
        "--total-wall-seconds", str(total_wall_seconds),
    ]
    if output_dir is not None:
        command.extend(["--output-dir", str(output_dir)])
    command.extend(extra_args or [])
    env = os.environ.copy()
    env.update(TEMP_ENV)
    completed = subprocess.run(
        command, cwd=ROOT, env=env, capture_output=True, text=True,
        check=False, timeout=45,
    )
    result = json.loads(completed.stdout) if completed.stdout.strip() else None
    return completed, result


def _tap(*, plan: str | None = "1..1", outcome: str = "ok 1 - test") -> str:
    lines = [
        "TAP version 13", "# cstar-stage: request", outcome,
    ]
    if plan is not None:
        lines.append(plan)
    lines.extend([
        "# tests 1", "# pass 1", "# fail 0", "# skipped 0", "# todo 0",
        "# cancelled 0",
    ])
    return "\n".join(lines) + "\n"


def test_real_smoke_fixture_accepts_fixed_command_and_explicit_receipt(tmp_path: Path) -> None:
    output_dir = tmp_path / "checker" / "receipts"
    completed, result = _invoke(tmp_path, output_dir=output_dir)
    assert completed.returncode == 0
    assert result is not None
    assert result["sprt_verdict"] == "ACCEPTED"
    assert result["workflow_score"] == 100.0
    assert result["gungnir"]["valid"] is True
    assert result["gungnir"]["scored_count"] == 1
    assert result["gungnir"]["excluded_count"] == 0
    assert result["gungnir"]["authority"] == "heuristic_evidence_only"
    assert (result["passed"], result["failed"], result["total"]) == (11, 0, 11)
    assert result["stage_coverage"]["missing"] == []
    argv = result["command_argv"]["full_lifecycle"]
    assert argv[1:] == list(core.FIXED_LIFECYCLE_ARGUMENTS)
    assert argv[0] == result["node_runtime"]["selected"]["path"]
    assert sum(probe["selected"] for probe in result["node_runtime"]["probes"]) == 1
    receipt = result["receipt"]
    raw = Path(receipt["path"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == receipt["sha256"]
    assert Path(receipt["sha256_path"]).is_file()


def test_repository_native_node_selection_is_autonomous_and_no_write() -> None:
    evidence = runner.select_compatible_node(ROOT, time.monotonic() + 30.0)
    selected = evidence["selected"]
    assert selected is not None
    assert Path(selected["path"]).is_absolute()
    assert selected["node_version"]
    assert str(selected["modules_abi"]).isdigit()
    assert selected["better_sqlite3_version"]
    assert evidence["smoke_is_no_write"] is True
    assert evidence["compatibility_smoke"] == "in_memory_select_1_no_write"
    assert sum(probe["selected"] for probe in evidence["probes"]) == 1
    if evidence["probes"][0]["node_version"] == "v26.5.0":
        assert evidence["probes"][0]["modules_abi"] == "147"
        assert evidence["probes"][0]["compatible"] is False
        assert selected["modules_abi"] == "141"


def test_no_compatible_node_fails_closed_with_selection_evidence(tmp_path: Path) -> None:
    completed, result = _invoke(tmp_path, compatible_native=False, max_trials=0)
    assert completed.returncode != 0
    assert result is not None
    assert result["sprt_verdict"] == "REJECTED"
    assert result["stop_reason"] == "fail_closed_no_compatible_node"
    assert result["node_runtime"]["selected"] is None
    assert result["cstar_acceptance"] == "UNVERIFIED"
    assert result["autoresearcher"]["next_action"] == "dispatch_repair_bead"


def test_rejected_trial_is_proposal_only_and_never_cstar_accepted(tmp_path: Path) -> None:
    completed, result = _invoke(tmp_path, trial_mode="fail")
    assert completed.returncode != 0
    assert result is not None
    assert result["sprt_verdict"] == "REJECTED"
    assert result["cstar_acceptance"] == "UNVERIFIED"
    assert result["autoresearcher"]["mode"] == "proposal_only"
    assert result["autoresearcher"]["next_action"] == "dispatch_repair_bead"
    assert 0 < len(result["failed_stage_fingerprints"]) <= 8


def test_zero_denominator_is_inconclusive_and_never_accepted(tmp_path: Path) -> None:
    completed, result = _invoke(tmp_path, max_trials=0)
    assert completed.returncode != 0
    assert result is not None
    assert result["sprt_verdict"] == "INCONCLUSIVE"
    assert result["stop_reason"] == "zero_denominator"
    assert (result["passed"], result["failed"], result["total"]) == (0, 0, 0)
    assert result["cstar_acceptance"] == "UNVERIFIED"


def test_missing_protected_stage_fails_closed(tmp_path: Path) -> None:
    completed, result = _invoke(tmp_path, stage_mode="missing")
    assert completed.returncode != 0
    assert result is not None
    assert result["sprt_verdict"] == "REJECTED"
    assert result["stop_reason"] == "fail_closed_stage_pass"
    assert set(result["stage_coverage"]["missing"]) == set(STAGES)


def test_timeout_fails_closed_without_acceptance(tmp_path: Path) -> None:
    completed, result = _invoke(tmp_path, trial_mode="timeout", timeout_seconds=0.2)
    assert completed.returncode != 0
    assert result is not None
    assert result["sprt_verdict"] == "REJECTED"
    assert result["stop_reason"] == "fail_closed_timeout"
    assert result["trials"][0]["timed_out"] is True
    assert result["cstar_acceptance"] == "UNVERIFIED"


@pytest.mark.parametrize("mode", ["malformed", "skip"])
def test_malformed_or_skipped_tap_fails_closed(tmp_path: Path, mode: str) -> None:
    completed, result = _invoke(tmp_path, trial_mode=mode)
    assert completed.returncode != 0
    assert result is not None
    assert result["sprt_verdict"] == "REJECTED"
    assert result["failed_stage_fingerprints"]


def test_trial_hashes_are_ordered_and_deterministic(tmp_path: Path) -> None:
    first_completed, first = _invoke(tmp_path)
    second_completed, second = _invoke(tmp_path)
    assert first_completed.returncode == second_completed.returncode == 0
    assert first is not None and second is not None
    assert first["trial_hashes"] == second["trial_hashes"]
    assert first["trial_hashes"] == [trial["trial_hash"] for trial in first["trials"]]
    assert first["candidate_source_digest"] == second["candidate_source_digest"]


def test_side_effect_and_model_identity_declarations_are_explicit(tmp_path: Path) -> None:
    _, result = _invoke(tmp_path, max_trials=0)
    assert result is not None
    assert (result["requested_model"], result["actual_model"]) == ("gpt-5.6-luna", None)
    assert (result["requested_reasoning"], result["actual_reasoning"]) == ("max", None)
    effects = result["external_effects"]
    for key in (
        "live_mcp", "live_provider", "live_source", "network",
        "direct_hall_sqlite_writes", "secrets_or_config", "production",
    ):
        assert effects[key] is False
    assert result["lifecycle"]["cstar_record_result_called"] is False


def test_no_output_directory_means_no_receipt_file(tmp_path: Path) -> None:
    _, result = _invoke(tmp_path, max_trials=0)
    assert result is not None and "receipt" not in result
    assert not list(tmp_path.rglob("receipt.json"))


@pytest.mark.parametrize(
    ("plan", "reason"),
    [
        (None, "malformed_tap_missing_plan"),
        ("1..2", "malformed_tap_plan_outcome_mismatch"),
        ("1..x", "malformed_tap_plan"),
    ],
)
def test_tap_rejects_missing_mismatched_and_malformed_plan(
    plan: str | None, reason: str,
) -> None:
    parsed = core.parse_tap(_tap(plan=plan))
    assert parsed["valid"] is False
    assert parsed["reason"] == reason


def test_tap_rejects_duplicate_and_nonterminal_plan() -> None:
    duplicate = _tap().replace("1..1\n", "1..1\n1..1\n")
    assert core.parse_tap(duplicate)["reason"] == "malformed_tap_duplicate_plan"
    nonterminal = _tap().replace("ok 1 - test\n1..1", "1..1\nok 1 - test")
    assert core.parse_tap(nonterminal)["reason"] == "malformed_tap_nonterminal_plan"


@pytest.mark.parametrize(
    "output",
    [
        _tap(outcome="ok 1 - hidden skip # SKIP unavailable"),
        _tap(plan="1..1 # TODO later"),
        _tap().replace("ok 1 - test", "    1..x\nok 1 - test"),
    ],
)
def test_tap_rejects_hidden_directives_and_malformed_nested_plan(output: str) -> None:
    assert core.parse_tap(output)["valid"] is False


def test_tap_terminal_plan_matches_top_level_outcomes_with_nested_subtest() -> None:
    output = """\
TAP version 13
# Subtest: Forge runtime lifecycle gate
    ok 1 - nested test
    1..1
ok 1 - Forge runtime lifecycle gate
1..1
# tests 1
# pass 1
# fail 0
# skipped 0
# todo 0
# cancelled 0
"""
    parsed = core.parse_tap(output)
    assert parsed["valid"] is True
    assert parsed["plan_total"] == parsed["top_level_outcomes"] == 1


def test_hard_limit_boundaries_are_source_owned() -> None:
    core.validate_limits(
        core.HARD_MAX_TRIALS,
        core.HARD_PROCESS_TIMEOUT_SECONDS,
        core.HARD_TOTAL_WALL_SECONDS,
    )
    for values in (
        (core.HARD_MAX_TRIALS + 1, 1.0, 1.0),
        (1, core.HARD_PROCESS_TIMEOUT_SECONDS + 0.001, 1.0),
        (1, 1.0, core.HARD_TOTAL_WALL_SECONDS + 0.001),
    ):
        with pytest.raises(core.RunnerError):
            core.validate_limits(*values)


@pytest.mark.parametrize(
    "flag",
    ["--stage-command", "--trial-command", "--full-lifecycle-command", "--module", "--alpha"],
)
def test_cli_rejects_attempted_command_module_or_hypothesis_widening(
    tmp_path: Path, flag: str,
) -> None:
    completed, result = _invoke(tmp_path, max_trials=0, extra_args=[flag, sys.executable])
    assert completed.returncode == 2
    assert result is None
    assert "unrecognized arguments" in completed.stderr


@pytest.mark.parametrize(
    ("max_trials", "timeout_seconds", "total_wall_seconds"),
    [
        (core.HARD_MAX_TRIALS + 1, 1.0, 30.0),
        (0, core.HARD_PROCESS_TIMEOUT_SECONDS + 1.0, 30.0),
        (0, 1.0, core.HARD_TOTAL_WALL_SECONDS + 1.0),
    ],
)
def test_cli_cannot_exceed_hard_caps(
    tmp_path: Path, max_trials: int, timeout_seconds: float, total_wall_seconds: float,
) -> None:
    completed, result = _invoke(
        tmp_path, max_trials=max_trials, timeout_seconds=timeout_seconds,
        total_wall_seconds=total_wall_seconds,
    )
    assert completed.returncode == 2
    assert result is not None
    assert result["sprt_verdict"] == "INCONCLUSIVE"
    assert result["total"] == 0
    assert result["cstar_acceptance"] == "UNVERIFIED"
