from src.core.engine.alfred_observer import AlfredOverwatch


def test_alfred_overwatch_analyze_failure():
    """Verifies failure analysis logic."""
    overwatch = AlfredOverwatch()
    error_type, suggestion = overwatch.analyze_failure("test.py", "SyntaxError: invalid syntax")
    assert error_type == "SyntaxError"
    assert "indents" in suggestion.lower() or "check" in suggestion.lower()

def test_alfred_overwatch_write_suggestion(tmp_path):
    """Verifies that suggestions are appended to the file."""
    overwatch = AlfredOverwatch()
    suggestion_file = tmp_path / "suggestions.md"
    overwatch.write_suggestion("Test Suggestion", str(suggestion_file))

    content = suggestion_file.read_text(encoding='utf-8')
    assert "Test Suggestion" in content
    assert "## " in content # Timestamp
