import pytest
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
from src.core.engine.sovereign_worker import SovereignWorker, CStarBridge

@pytest.fixture
def project_root(tmp_path):
    return tmp_path

@pytest.fixture
def bridge(project_root):
    return CStarBridge(project_root)

@pytest.fixture
def worker(project_root):
    return SovereignWorker(project_root, max_turns=2)

class TestCStarBridge:
    def test_run_shell_command(self, bridge):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="success", stderr="")
            result = bridge.execute_tool("run_shell_command", {"command": "ls"})
            assert "Exit Code: 0" in result
            assert "success" in result

    def test_read_file(self, bridge, project_root):
        test_file = project_root / "test.txt"
        test_file.write_text("hello world")
        result = bridge.execute_tool("read_file", {"path": "test.txt"})
        assert result == "hello world"

    def test_write_file(self, bridge, project_root):
        result = bridge.execute_tool("write_file", {"path": "out.txt", "content": "data"})
        assert "Successfully wrote to out.txt" in result
        assert (project_root / "out.txt").read_text() == "data"

    def test_list_directory(self, bridge, project_root):
        (project_root / "subdir").mkdir()
        (project_root / "file.txt").touch()
        result = bridge.execute_tool("list_directory", {"path": "."})
        assert "subdir" in result
        assert "file.txt" in result

    def test_tool_not_found(self, bridge):
        result = bridge.execute_tool("unknown", {})
        assert "Tool 'unknown' not found" in result

class TestSovereignWorker:
    def test_parse_tool_calls(self, worker):
        text = """
        <invoke name='read_file'>
            <path>test.txt</path>
        </invoke>
        <invoke name='run_shell_command'>
            <arg_name>command</arg_name>
            <arg_value>echo hello</arg_value>
        </invoke>
        """
        calls = worker._parse_tool_calls(text)
        assert len(calls) == 2
        assert calls[0][0] == "read_file"
        assert calls[0][1]["path"] == "test.txt"
        assert calls[1][0] == "run_shell_command"
        assert calls[1][1]["command"] == "echo hello"

    @patch("requests.post")
    def test_run_completion(self, mock_post, worker):
        # Turn 1: Assistant returns completion token
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"choices": [{"message": {"content": "Task DONE"}}]}
        )
        
        result = worker.run("sys", "user")
        assert "ASSISTANT: Task DONE" in result
        assert mock_post.call_count == 1

    @patch("requests.post")
    def test_run_with_tool_call(self, mock_post, worker, project_root):
        # Turn 1: Assistant returns tool call
        # Turn 2: Assistant returns DONE
        mock_post.side_effect = [
            MagicMock(
                status_code=200,
                json=lambda: {"choices": [{"message": {"content": "<invoke name='write_file'><path>log.txt</path><content>hi</content></invoke>"}}]}
            ),
            MagicMock(
                status_code=200,
                json=lambda: {"choices": [{"message": {"content": "DONE"}}]}
            )
        ]
        
        result = worker.run("sys", "user")
        assert "USER (TOOL RESULT): Result of write_file: Successfully wrote to log.txt" in result
        assert "ASSISTANT: DONE" in result
        assert (project_root / "log.txt").read_text() == "hi"

    @patch("requests.post")
    def test_llm_error(self, mock_post, worker):
        mock_post.return_value = MagicMock(status_code=500, text="Internal Error")
        result = worker.run("sys", "user")
        assert "SYSTEM: Error calling local LLM: 500 Internal Error" in result
