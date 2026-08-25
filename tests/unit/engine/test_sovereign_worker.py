from pathlib import Path

import pytest

from src.core.engine import sovereign_worker


def test_bridge_rejects_every_tool_without_filesystem_mutation(tmp_path):
    bridge = sovereign_worker.CStarBridge(tmp_path)
    with pytest.raises(sovereign_worker.LegacyExecutionLaneDecommissioned):
        bridge.execute_tool("write_file", {"path": "out.txt", "content": "data"})
    assert not (tmp_path / "out.txt").exists()


def test_worker_rejects_before_model_invocation(tmp_path):
    worker = sovereign_worker.SovereignWorker(tmp_path)
    with pytest.raises(sovereign_worker.LegacyExecutionLaneDecommissioned):
        worker.run("system", "task")
    assert worker.messages == []


def test_worker_source_has_no_model_process_or_write_lane():
    source = Path(sovereign_worker.__file__).read_text(encoding="utf-8")
    for forbidden in (
        "requests",
        "subprocess",
        "shell=True",
        "write_text(",
        ".mkdir(",
        "http://",
    ):
        assert forbidden not in source


def test_cli_reports_canonical_forge_route(capsys):
    assert sovereign_worker.main() == 2
    output = capsys.readouterr().out
    assert sovereign_worker.DECOMMISSIONED_CODE in output
    assert "cstar_forge_request" in output
    assert "cstar_record_result" in output
