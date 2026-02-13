import pytest
from pathlib import Path
from src.sentinel.code_sanitizer import (
    validate_syntax, 
    repair_syntax, 
    sanitize_code,
    classify_error
)

def test_validate_syntax():
    assert validate_syntax("print('hi')")[0] is True
    assert validate_syntax("print('hi'")[0] is False

def test_repair_syntax():
    # Fix missing colon
    code = "if True\n    pass"
    repaired = repair_syntax(code)
    assert "if True:" in repaired

def test_sanitize_code():
    # Strip markdown fences
    code = "```python\nprint('hi')\n```"
    sanitized = sanitize_code(code)
    assert sanitized.strip() == "print('hi')"

def test_classify_error():
    assert classify_error("IndentationError: expected an indented block") == "INDENT"
    assert classify_error("ModuleNotFoundError: No module named 'fake'") == "IMPORT"
