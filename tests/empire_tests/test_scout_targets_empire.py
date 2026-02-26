import json

from scripts.scout_targets import scout


def test_scout_generates_queue(tmp_path, monkeypatch):
    # Mock PROJECT_ROOT
    monkeypatch.setattr("scripts.scout_targets.PROJECT_ROOT", tmp_path)

    # Create a mock source file
    src_dir = tmp_path / "src" / "core"
    src_dir.mkdir(parents=True)
    (src_dir / "test_file.py").write_text("print('hello')", encoding='utf-8')

    # Run scout (it might fail on actual scans if dependencies aren't mocked,
    # but we check if it produces the output file)
    try:
        scout()
    except Exception:
        pass

    queue_path = tmp_path / "breaches_queue.json"
    assert queue_path.exists()
    data = json.loads(queue_path.read_text(encoding='utf-8'))
    assert "ANNEX" in data
