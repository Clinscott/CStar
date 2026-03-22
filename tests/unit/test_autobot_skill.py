import json
import os
import sys
import textwrap
from pathlib import Path

from src.core.engine.autobot_skill import (
    DEFAULT_HERMES_API_KEY,
    DEFAULT_HERMES_BASE_URL,
    DEFAULT_HERMES_MODEL,
    build_base_env,
    build_bead_command,
    build_bead_prompt,
    build_command,
    build_done_sentinel,
    execute_autobot,
)
from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord


def seed_bead(root: Path) -> str:
    agents_dir = root / ".agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-autobot-1",
            repo_id=repo.repo_id,
            scan_kind="autobot_test",
            status="COMPLETED",
            baseline_gungnir_score=6.0,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-autobot-1",
            path="target.txt",
            gungnir_score=6.0,
            created_at=1700000000200,
        )
    )
    bead = BeadLedger(root).upsert_bead(
        scan_id="scan-autobot-1",
        target_path="target.txt",
        rationale="Make the target file say PASS.",
        contract_refs=["contracts:autobot-target"],
        baseline_scores={"overall": 6.0},
        acceptance_criteria="target.txt contains PASS.",
    )
    return bead.id


def test_build_command_defaults_to_local_hermes_binary_and_model(tmp_path: Path) -> None:
    hermes = tmp_path / "hermes-agent" / ".venv" / "bin" / "hermes"
    hermes.parent.mkdir(parents=True, exist_ok=True)
    hermes.write_text("#!/bin/sh\n", encoding="utf-8")

    command = build_command(None, [], autobot_dir=tmp_path)

    assert command == [str(hermes), "chat", "-m", DEFAULT_HERMES_MODEL]


def test_build_bead_command_appends_query_and_quiet_mode(tmp_path: Path) -> None:
    hermes = tmp_path / "hermes-agent" / ".venv" / "bin" / "hermes"
    hermes.parent.mkdir(parents=True, exist_ok=True)
    hermes.write_text("#!/bin/sh\n", encoding="utf-8")

    command = build_bead_command(None, [], autobot_dir=tmp_path, task_prompt="fix the bead")

    assert command == [str(hermes), "chat", "-m", DEFAULT_HERMES_MODEL, "-q", "fix the bead", "-Q"]


def test_build_base_env_applies_local_defaults_but_allows_overrides() -> None:
    env = build_base_env(
        {
            "OPENAI_BASE_URL": "http://example.invalid/v1",
            "OPENAI_API_KEY": "override-key",
            "CORVUS_EXTRA": "1",
        }
    )

    assert env["OPENAI_BASE_URL"] == "http://example.invalid/v1"
    assert env["OPENAI_API_KEY"] == "override-key"
    assert env["CORVUS_EXTRA"] == "1"

    defaults = build_base_env()
    assert defaults["OPENAI_BASE_URL"] == DEFAULT_HERMES_BASE_URL
    assert defaults["OPENAI_API_KEY"] == DEFAULT_HERMES_API_KEY


def test_build_bead_prompt_uses_worker_note_as_authoritative_brief_without_duplication(tmp_path: Path) -> None:
    bead_id = seed_bead(tmp_path)
    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert bead is not None

    worker_note = "\n".join(
        [
            "Local Hermes micro-bead.",
            "Target path: target.txt",
            'Checker shell: grep -q PASS "$CORVUS_PROJECT_ROOT/target.txt"',
            "Contract refs: contracts:autobot-target",
            "Bead rationale: Make the target file say PASS.",
            "Acceptance criteria: target.txt contains PASS.",
            'Baseline scores: {"overall": 6.0}',
        ]
    )

    prompt = build_bead_prompt(
        project_root=tmp_path,
        bead=bead,
        attempt=1,
        done_sentinel=build_done_sentinel(bead, 1),
        retry_feedback=None,
        worker_note=worker_note,
    )

    assert "Authoritative Hall/PennyOne brief:" in prompt
    assert prompt.count("Target path:") == 1
    assert prompt.count("Checker shell:") == 1
    assert prompt.count("Contract refs:") == 1
    assert prompt.count("Acceptance criteria:") == 1
    assert prompt.count("Baseline scores:") == 1
    assert "Rationale:" not in prompt


def test_execute_autobot_resolves_via_preflight_without_launching_hermes(tmp_path: Path) -> None:
    bead_id = seed_bead(tmp_path)
    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert bead is not None
    target = tmp_path / "target.txt"
    target.write_text("PASS\n", encoding="utf-8")
    post_bead_seconds = (bead.created_at / 1000) + 5
    os.utime(target, (post_bead_seconds, post_bead_seconds))
    launch_marker = tmp_path / "hermes-launched.txt"
    worker_code = textwrap.dedent(
        f"""\
        from pathlib import Path

        Path({str(launch_marker)!r}).write_text("launched\\n", encoding="utf-8")
        """
    )

    result = execute_autobot(
        tmp_path,
        bead_id=bead_id,
        checker_shell='grep -q PASS "$CORVUS_PROJECT_ROOT/target.txt"',
        max_attempts=2,
        command=sys.executable,
        command_args=["-u", "-c", worker_code],
        no_stream=True,
    )

    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert result.status == "SUCCESS"
    assert result.outcome == "RESOLVED_PREFLIGHT"
    assert result.attempt_count == 0
    assert result.validation_id is not None
    assert bead is not None
    assert bead.status == "RESOLVED"
    assert bead.resolved_validation_id == result.validation_id
    assert not launch_marker.exists()
    assert result.metadata["attempt_artifacts"] == []


def test_execute_autobot_preflight_pass_without_post_bead_changes_still_runs_hermes(tmp_path: Path) -> None:
    bead_id = seed_bead(tmp_path)
    target = tmp_path / "target.txt"
    target.write_text("PASS\n", encoding="utf-8")
    os.utime(target, (1_700_000_000, 1_700_000_000))
    launch_marker = tmp_path / "hermes-launched.txt"
    worker_code = textwrap.dedent(
        f"""\
        import os
        import re
        import sys
        from pathlib import Path

        Path({str(launch_marker)!r}).write_text("launched\\n", encoding="utf-8")
        prompt = ""
        args = iter(sys.argv[1:])
        for arg in args:
            if arg in {{"-q", "--query"}}:
                prompt = next(args, "")
            elif arg.startswith("--query="):
                prompt = arg.split("=", 1)[1]
        match = re.search(r"(AUTOBOT_BEAD_COMPLETE::[^\\s]+::ATTEMPT::\\d+)", prompt)
        if match:
            print(match.group(1))
        print("session_id: stub-autobot")
        """
    )

    result = execute_autobot(
        tmp_path,
        bead_id=bead_id,
        checker_shell='grep -q PASS "$CORVUS_PROJECT_ROOT/target.txt"',
        max_attempts=1,
        command=sys.executable,
        command_args=["-u", "-c", worker_code],
        no_stream=True,
    )

    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert result.status == "SUCCESS"
    assert result.outcome == "RESOLVED"
    assert result.attempt_count == 1
    assert result.validation_id is not None
    assert bead is not None
    assert bead.status == "RESOLVED"
    assert launch_marker.exists()
    attempt_artifacts = result.metadata["attempt_artifacts"]
    assert len(attempt_artifacts) == 1


def test_execute_autobot_preflight_failure_falls_through_and_retries_to_resolution(tmp_path: Path) -> None:
    bead_id = seed_bead(tmp_path)
    worker_code = textwrap.dedent(
        """\
        import os
        import re
        import sys
        from pathlib import Path

        prompt = ""
        args = iter(sys.argv[1:])
        for arg in args:
            if arg in {"-q", "--query"}:
                prompt = next(args, "")
            elif arg.startswith("--query="):
                prompt = arg.split("=", 1)[1]
        target = Path(os.environ["CORVUS_PROJECT_ROOT"]) / "target.txt"
        if "Previous validation feedback:" in prompt:
            target.write_text("PASS\\n", encoding="utf-8")
        else:
            target.write_text("FAIL\\n", encoding="utf-8")
        match = re.search(r"(AUTOBOT_BEAD_COMPLETE::[^\\s]+::ATTEMPT::\\d+)", prompt)
        if match:
            print(match.group(1))
        print("session_id: stub-autobot")
        """
    )

    result = execute_autobot(
        tmp_path,
        bead_id=bead_id,
        checker_shell='grep -q PASS "$CORVUS_PROJECT_ROOT/target.txt"',
        max_attempts=2,
        command=sys.executable,
        command_args=["-u", "-c", worker_code],
        no_stream=True,
    )

    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert result.status == "SUCCESS"
    assert result.outcome == "RESOLVED"
    assert result.bead_id == bead_id
    assert result.attempt_count == 2
    assert result.validation_id is not None
    assert bead is not None
    assert bead.status == "RESOLVED"
    assert bead.resolved_validation_id == result.validation_id
    assert (tmp_path / "target.txt").read_text(encoding="utf-8").strip() == "PASS"
    attempt_artifacts = result.metadata["attempt_artifacts"]
    assert len(attempt_artifacts) == 2
    first_attempt = attempt_artifacts[0]
    second_attempt = attempt_artifacts[1]
    assert (tmp_path / first_attempt["prompt_path"]).is_file()
    assert (tmp_path / first_attempt["transcript_path"]).is_file()
    assert (tmp_path / first_attempt["metadata_path"]).is_file()
    assert (tmp_path / second_attempt["transcript_path"]).read_text(encoding="utf-8")
    first_metadata = json.loads((tmp_path / first_attempt["metadata_path"]).read_text(encoding="utf-8"))
    assert first_metadata["status"] == "SUCCESS"
    assert first_metadata["env"]["OPENAI_API_KEY"] == "<redacted>"


def test_execute_autobot_persists_failure_artifacts_on_timeout(tmp_path: Path) -> None:
    bead_id = seed_bead(tmp_path)
    worker_code = textwrap.dedent(
        """\
        import time

        time.sleep(60)
        """
    )

    result = execute_autobot(
        tmp_path,
        bead_id=bead_id,
        max_attempts=1,
        timeout=0.5,
        command=sys.executable,
        command_args=["-u", "-c", worker_code],
        no_stream=True,
    )

    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert result.status == "FAILURE"
    assert result.outcome == "BLOCKED"
    assert "Diagnostic transcript:" in result.metadata["worker_failure"]
    attempt_artifacts = result.metadata["attempt_artifacts"]
    assert len(attempt_artifacts) == 1
    artifact = attempt_artifacts[0]
    transcript_path = tmp_path / artifact["transcript_path"]
    metadata_path = tmp_path / artifact["metadata_path"]
    assert transcript_path.is_file()
    assert metadata_path.is_file()
    assert transcript_path.read_text(encoding="utf-8") == ""
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    assert metadata["status"] == "FAILURE"
    assert metadata["detail"].startswith("Hermes single-query command exceeded the hard timeout")
    assert bead is not None
    assert bead.status == "BLOCKED"
