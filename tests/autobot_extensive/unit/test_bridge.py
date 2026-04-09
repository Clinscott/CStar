import pytest
from pathlib import Path
from src.core.engine.sovereign_worker import CStarBridge

def test_bridge_resolves_relative_paths(tmp_path):
    bridge = CStarBridge(tmp_path)
    # Relative path
    p = bridge._resolve_path("subdir/file.txt")
    assert p == tmp_path / "subdir" / "file.txt"

def test_bridge_prevents_escape_via_absolute_path(tmp_path):
    bridge = CStarBridge(tmp_path)
    # Absolute path outside root should be re-based
    p = bridge._resolve_path("/etc/passwd")
    assert p == tmp_path / "etc/passwd"

def test_bridge_read_write_file(tmp_path):
    bridge = CStarBridge(tmp_path)
    path = "test.txt"
    content = "hello world"

    # Write
    res = bridge.execute_tool("write_file", {"path": path, "content": content})
    assert "Successfully wrote to test.txt" in res
    assert (tmp_path / path).read_text() == content

    # Read
    res = bridge.execute_tool("read_file", {"path": path})
    assert res == content

def test_bridge_list_directory(tmp_path):
    bridge = CStarBridge(tmp_path)
    (tmp_path / "dir1").mkdir()
    (tmp_path / "dir2").mkdir()
    (tmp_path / "file1.txt").touch()

    res = bridge.execute_tool("list_directory", {"path": "."})
    items = res.split("\n")
    assert "dir1" in items
    assert "dir2" in items
    assert "file1.txt" in items

def test_bridge_run_shell_command(tmp_path):
    bridge = CStarBridge(tmp_path)
    res = bridge.execute_tool("run_shell_command", {"command": "echo 'hello shell'"})
    assert "Exit Code: 0" in res
    assert "hello shell" in res

def test_bridge_invalid_tool(tmp_path):
    bridge = CStarBridge(tmp_path)
    res = bridge.execute_tool("invalid_tool", {})
    assert "Error: Tool 'invalid_tool' not found" in res
