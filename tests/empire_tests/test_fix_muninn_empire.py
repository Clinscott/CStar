import pytest

from scripts.fix_muninn import RETIRED_ERROR, standardize_muninn


def test_standardize_muninn(tmp_path):
    test_file = tmp_path / "muninn_mock.py"
    original = "class RuneCasterWarden:\n    pass\n"
    test_file.write_text(original, encoding="utf-8")

    with pytest.raises(RuntimeError, match=RETIRED_ERROR):
        standardize_muninn(test_file)
    assert test_file.read_text(encoding="utf-8") == original
