from src.sentinel.code_sanitizer import BifrostGate

gate = BifrostGate()


def test_validate_syntax():
    assert gate.validate_syntax("print('hi')")[0] is True
    assert gate.validate_syntax("print('hi'")[0] is False

def test_repair_syntax():
    # Fix missing colon
    code = "if True\n    pass"
    repaired = gate.repair_syntax(code)
    assert "if True:" in repaired

def test_sanitize_code():
    # Strip markdown fences
    code = "```python\nprint('hi')\n```"
    sanitized = gate.sanitize_code(code)
    assert sanitized.strip() == "print('hi')"

def test_classify_error():
    assert BifrostGate.classify_error("IndentationError: expected an indented block") == "INDENT"
    assert BifrostGate.classify_error("ModuleNotFoundError: No module named 'fake'") == "IMPORT"
