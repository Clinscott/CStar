from pathlib import Path

from src.tools.migrate_to_qmd import get_checksum


def test_get_checksum_valid(tmp_path):
    f = tmp_path / "test.txt"
    f.write_text("hello world", encoding='utf-8')
    cs = get_checksum(f)
    assert len(cs) == 64
    assert cs != "ERROR"
    assert cs != "EMPTY_FILE"

def test_get_checksum_empty(tmp_path):
    f = tmp_path / "empty.txt"
    f.touch()
    assert get_checksum(f) == "EMPTY_FILE"

def test_get_checksum_missing():
    assert get_checksum(Path("missing_file_xyz.txt")) == "ERROR"
