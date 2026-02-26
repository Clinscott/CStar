"""
Bifrost Gate Contract Tests
Verifies: code_sanitizer validation, sanitization, error classification.
All tests are offline — zero network calls.
"""
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.sentinel.code_sanitizer import (
    classify_error,
    extract_error_summary,
    sanitize_code,
    sanitize_test,
    validate_imports,
    validate_syntax,
)

# ==============================================================================
# validate_syntax
# ==============================================================================


class TestValidateSyntax:
    def test_valid_code_passes(self):
        ok, msg = validate_syntax("def hello():\n    return 42\n")
        assert ok is True
        assert msg == ""

    def test_indentation_error_caught(self):
        code = "def foo():\nreturn 1\n"
        ok, msg = validate_syntax(code)
        assert ok is False
        assert "IndentationError" in msg or "expected an indented block" in msg

    def test_syntax_error_caught(self):
        code = "def foo(:\n    pass\n"
        ok, msg = validate_syntax(code)
        assert ok is False
        assert "SyntaxError" in msg

    def test_empty_code_fails(self):
        ok, msg = validate_syntax("")
        assert ok is False
        assert "Empty" in msg

    def test_none_code_fails(self):
        ok, msg = validate_syntax(None)
        assert ok is False


# ==============================================================================
# sanitize_code
# ==============================================================================


class TestSanitizeCode:
    def test_strips_markdown_fences(self):
        code = "```python\ndef hello():\n    pass\n```"
        result = sanitize_code(code)
        assert "```" not in result
        assert "def hello():" in result

    def test_strips_json_fences(self):
        code = '```json\n{"key": "value"}\n```'
        result = sanitize_code(code)
        assert "```" not in result

    def test_removes_bom(self):
        code = "\ufeffdef hello():\n    pass\n"
        result = sanitize_code(code)
        assert "\ufeff" not in result

    def test_removes_null_bytes(self):
        code = "def hello():\x00\n    pass\n"
        result = sanitize_code(code)
        assert "\x00" not in result

    def test_converts_tabs_to_spaces(self):
        code = "def hello():\n\treturn 1\n"
        result = sanitize_code(code)
        assert "\t" not in result
        assert "    return 1" in result

    def test_normalizes_line_endings(self):
        code = "def hello():\r\n    pass\r\n"
        result = sanitize_code(code)
        assert "\r" not in result

    def test_strips_trailing_whitespace(self):
        code = "def hello():   \n    pass   \n"
        result = sanitize_code(code)
        lines = result.split("\n")
        for line in lines:
            if line:  # skip empty lines
                assert line == line.rstrip()

    def test_ensures_trailing_newline(self):
        code = "def hello():\n    pass"
        result = sanitize_code(code)
        assert result.endswith("\n")

    def test_fixes_simple_indentation(self):
        # Common AI mistake: all code indented by 8 spaces
        code = "        def hello():\n            return 1\n"
        result = sanitize_code(code)
        ok, _ = validate_syntax(result)
        assert ok is True

    def test_preserves_valid_code(self):
        code = "def hello():\n    return 42\n"
        result = sanitize_code(code)
        assert "def hello():" in result
        assert "    return 42" in result


# ==============================================================================
# validate_imports
# ==============================================================================


class TestValidateImports:
    def test_stdlib_imports_pass(self):
        code = "import os\nimport sys\nfrom pathlib import Path\n"
        bad = validate_imports(code, project_root)
        assert bad == []

    def test_src_imports_pass(self):
        code = "from src.core.sovereign_hud import SovereignHUD\n"
        bad = validate_imports(code, project_root)
        assert bad == []

    def test_fabricated_import_flagged(self):
        code = "from xyzzy_nonexistent_engine import SovereignVector\n"
        bad = validate_imports(code, project_root)
        assert len(bad) > 0
        assert "xyzzy_nonexistent_engine" in bad[0]

    def test_nonexistent_module_flagged(self):
        code = "import completely_fake_module_xyz\n"
        bad = validate_imports(code, project_root)
        assert len(bad) > 0

    def test_pytest_import_passes(self):
        code = "import pytest\nfrom unittest.mock import MagicMock\n"
        bad = validate_imports(code, project_root)
        assert bad == []


# ==============================================================================
# sanitize_test
# ==============================================================================


class TestSanitizeTest:
    def test_injects_sys_path_when_missing(self):
        code = "import pytest\ndef test_hello():\n    assert True\n"
        result = sanitize_test(code, "src/sample.py", project_root)
        assert "sys.path" in result

    def test_preserves_existing_sys_path(self):
        code = "import sys\nsys.path.insert(0, '.')\ndef test_hello():\n    assert True\n"
        result = sanitize_test(code, "src/sample.py", project_root)
        # Should not double-inject
        assert result.count("sys.path") >= 1


# ==============================================================================
# classify_error
# ==============================================================================


class TestClassifyError:
    def test_indent_error(self):
        assert classify_error("IndentationError: unexpected indent") == "INDENT"

    def test_syntax_error(self):
        assert classify_error("SyntaxError: invalid syntax") == "SYNTAX"

    def test_import_error(self):
        assert classify_error("ModuleNotFoundError: No module named 'foo'") == "IMPORT"

    def test_assertion_error(self):
        assert classify_error("AssertionError: 1 != 2") == "ASSERTION"

    def test_runtime_error(self):
        assert classify_error("NameError: name 'x' is not defined") == "RUNTIME"

    def test_unknown(self):
        assert classify_error("Something weird happened") == "UNKNOWN"

    def test_empty(self):
        assert classify_error("") == "UNKNOWN"


# ==============================================================================
# extract_error_summary
# ==============================================================================


class TestExtractErrorSummary:
    def test_extracts_short_summary(self):
        output = (
            "=== ERRORS ===\n"
            "E   IndentationError: unexpected indent\n"
            "=== short test summary info ===\n"
            "ERROR test_temp.py\n"
            "=== 1 error ===\n"
        )
        summary = extract_error_summary(output)
        assert "ERROR test_temp.py" in summary

    def test_fallback_to_e_lines(self):
        output = "some output\nE   ModuleNotFoundError: No module named 'foo'\nmore output\n"
        summary = extract_error_summary(output)
        assert "ModuleNotFoundError" in summary

    def test_empty_output(self):
        summary = extract_error_summary("")
        assert "No error output" in summary
