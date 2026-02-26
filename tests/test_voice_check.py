import sys

import pytest

from src.tools.voice_check import main


@pytest.fixture
def mock_phrases(tmp_path, monkeypatch):
    """Creates a mock phrases.yaml."""
    phrase_file = tmp_path / "phrases.yaml"
    content = "ODIN:\n  TASK_FAILED:\n    - phrase: 'Failure is death.'\n      tags: ['harsh']"
    phrase_file.write_text(content, encoding='utf-8')
    return phrase_file

def test_voice_check_usage(capsys, monkeypatch):
    """Verifies usage message when insufficient arguments are provided."""
    monkeypatch.setattr(sys, "argv", ["voice_check.py"])
    main()
    captured = capsys.readouterr()
    # Check for keywords instead of exact string due to ANSI codes
    assert "Usage" in captured.out
    assert "c* voice_check" in captured.out

def test_voice_check_execution(capsys, monkeypatch, mock_phrases):
    """Verifies that voice_check correctly retrieves a phrase."""
    # Patch DialogueEngine
    from src.core.engine.dialogue import DialogueEngine
    monkeypatch.setattr(DialogueEngine, "__init__", lambda self, path: None)
    monkeypatch.setattr(DialogueEngine, "get", lambda self, p, i, context=None: "Failure is death.")

    monkeypatch.setattr(sys, "argv", ["voice_check.py", "ODIN", "TASK_FAILED", "harsh"])
    main()

    captured = capsys.readouterr()
    assert "VOICE CHECK" in captured.out
    assert "Failure is death." in captured.out
