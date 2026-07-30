import pytest

from scripts.scout_targets import RETIRED_ERROR, scout


def test_scout_is_retired_and_writes_no_queue(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    with pytest.raises(RuntimeError, match=RETIRED_ERROR):
        scout()
    assert list(tmp_path.iterdir()) == []
