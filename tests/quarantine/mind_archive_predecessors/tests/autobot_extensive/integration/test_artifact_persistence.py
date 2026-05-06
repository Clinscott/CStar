import pytest
import json
from pathlib import Path
from src.core.engine.autobot_skill import persist_attempt_artifact
from src.core.engine.bead_ledger import SovereignBead

def test_persist_artifact_redacts_secrets(tmp_path):
    bead = SovereignBead(
        id="bead-secret",
        repo_id="repo-1",
        scan_id="scan-secret",
        status="OPEN",
        target_path="target.txt",
        rationale="test",
        contract_refs=[],
        baseline_scores={},
        acceptance_criteria="none",
        created_at=0,
        updated_at=0
    )

    extra_env = {
        "OPENAI_API_KEY": "sk-secret-key",
        "MY_TOKEN": "token-123",
        "PUBLIC_VAR": "hello"
    }

    artifact = persist_attempt_artifact(
        project_root=tmp_path,
        bead=bead,
        attempt=1,
        task_prompt="Secret task",
        transcript_text="Secret transcript",
        command=["hermes", "--api-key", "sk-secret-key"],
        extra_env=extra_env,
        status="SUCCESS",
        detail="Done",
        matched_pattern=None,
        returncode=0,
        elapsed_seconds=1.0
    )

    metadata_path = tmp_path / artifact.metadata_path
    assert metadata_path.exists()

    metadata = json.loads(metadata_path.read_text())
    assert metadata["env"]["OPENAI_API_KEY"] == "<redacted>"
    assert metadata["env"]["MY_TOKEN"] == "<redacted>"
    assert metadata["env"]["PUBLIC_VAR"] == "hello"

def test_persist_artifact_saves_files_in_stats_dir(tmp_path):
    bead_id = "bead-123"
    bead = SovereignBead(
        id=bead_id,
        repo_id="repo-1",
        scan_id="scan-1",
        status="OPEN",
        target_path="target.txt",
        rationale="test",
        contract_refs=[],
        baseline_scores={},
        acceptance_criteria="none",
        created_at=0,
        updated_at=0
    )

    artifact = persist_attempt_artifact(
        project_root=tmp_path,
        bead=bead,
        attempt=2,
        task_prompt="Prompt 2",
        transcript_text="Transcript 2",
        command=["cmd"],
        extra_env={},
        status="SUCCESS",
        detail="Done",
        matched_pattern=None,
        returncode=0,
        elapsed_seconds=1.0
    )

    stats_dir = tmp_path / ".stats" / "autobot" / bead_id
    assert stats_dir.exists()
    assert (stats_dir / "attempt-002.prompt.txt").read_text() == "Prompt 2"
    assert (stats_dir / "attempt-002.transcript.txt").read_text() == "Transcript 2"
    assert (stats_dir / "attempt-002.json").exists()
