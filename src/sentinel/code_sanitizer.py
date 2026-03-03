"""
The Bifrost Gate: Code Sanitizer
Identity: ODIN
Purpose: Validate and repair AI-generated code before it enters The Gauntlet.

No code passes through Bifrost without being worthy.
"""

import ast
import importlib
import re
import textwrap
from pathlib import Path


class QuarantineFailure(Exception):
    """Raised when a code snippet fails security sanitization."""
    pass

from src.tools.brave_search import BraveSearch

# ==============================================================================
# 📚 KNOWLEDGE BASE
# ==============================================================================

_KNOWN_THIRD_PARTY = {
    "pytest", "unittest", "mock", "colorama", "google", "vulture",
    "radon", "psutil", "dotenv", "requests", "json", "os", "sys",
    "pathlib", "subprocess", "shutil", "time", "hashlib", "re",
    "ast", "io", "textwrap", "contextlib", "importlib", "logging",
    "collections", "functools", "itertools", "typing", "dataclasses",
    "tempfile", "copy", "math", "random", "datetime", "abc",
    "enum", "struct", "socket", "http", "urllib", "base64",
    "inspect", "traceback", "pprint", "string", "operator",
    "warnings", "types", "glob", "fnmatch", "stat", "websockets",
    "chromadb", "pyarrow", "pandas", "numpy", "yaml", "charset_normalizer",
    "_pytest",  # pytest internals
}


# ==============================================================================
# 🌈 VALIDATION
# ==============================================================================


class BifrostGate:
    """
    Sovereign Code Sanitizer and Repair Engine.
    Mandate: The Spoke Protocol (AGENTS.qmd Section 2.1)
    """

    def __init__(self, project_root: Path | None = None):
        self.project_root = project_root or Path(__file__).parent.parent.parent.absolute()
        self.project_modules = self._get_project_modules(self.project_root)

    def validate_syntax(self, code: str) -> tuple[bool, str]:
        """Parse code with ast.parse(). Returns (is_valid, error_message)."""
        if not code or not code.strip():
            return False, "Empty code"
        try:
            ast.parse(code)
            return True, ""
        except SyntaxError as e:
            return False, f"SyntaxError at line {e.lineno}: {e.msg}"

    def _get_project_modules(self, project_root: Path) -> set[str]:
        """Build set of importable top-level modules from project."""
        project_modules = {"src"}
        src_dir = project_root / "src"
        if src_dir.exists():
            for p in src_dir.iterdir():
                if p.is_dir() and (p / "__init__.py").exists():
                    project_modules.add(p.name)
                elif p.suffix == ".py":
                    project_modules.add(p.stem)
        return project_modules

    def _check_import_node(self, node: ast.AST, project_modules: set[str]) -> list[str]:
        """Helper to validate a single import node."""
        bad_imports = []
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if top not in _KNOWN_THIRD_PARTY and top not in project_modules:
                    if not self._can_import(top):
                        bad_imports.append(f"line {node.lineno}: `import {alias.name}` — '{top}' is not a known module")
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                top = node.module.split(".")[0]
                if top not in _KNOWN_THIRD_PARTY and top not in project_modules:
                    if not self._can_import(top):
                        bad_imports.append(f"line {node.lineno}: `from {node.module} import ...` — '{top}' is not a known module")
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id == "__import__":
                bad_imports.append(f"line {node.lineno}: Forbidden dynamic import `__import__` detected.")
            elif isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                if node.func.value.id == "importlib":
                    bad_imports.append(f"line {node.lineno}: Forbidden dynamic import `importlib` detected.")
        return bad_imports

    def validate_imports(self, code: str) -> list[str]:
        """
        AST-walk import statements and flag any that cannot resolve.
        Returns a list of bad import descriptions.
        """
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return ["Code has syntax errors — cannot validate imports"]

        bad_imports = []
        for node in ast.walk(tree):
            bad_imports.extend(self._check_import_node(node, self.project_modules))

        return bad_imports

    def _can_import(self, module_name: str) -> bool:
        """Check if a module can be imported without side effects."""
        try:
            spec = importlib.util.find_spec(module_name)
            return spec is not None
        except (ModuleNotFoundError, ValueError, AttributeError):
            return False

    def repair_syntax(self, code: str) -> str:
        """
        Attempt to repair common AI-generated syntax errors.
        """
        if not code or not code.strip():
            return code

        lines = code.split("\n")
        repaired_lines = []

        for line in lines:
            stripped = line.rstrip()
            leading = line[:len(line) - len(line.lstrip())]

            # Fix: `def foo(:` → `def foo():`
            if re.match(r'^(\s*)(def|class)\s+\w+\(\s*:', stripped):
                stripped = re.sub(r'\(\s*:', '():', stripped)
                repaired_lines.append(leading + stripped.lstrip())
                continue

            # Fix: `def foo(x, y:` → `def foo(x, y):`
            if re.match(r'^(\s*)(def|class)\s+\w+\(', stripped):
                open_parens = stripped.count('(')
                close_parens = stripped.count(')')
                if open_parens > close_parens:
                    missing = open_parens - close_parens
                    if stripped.endswith(':'):
                        stripped = stripped[:-1] + ')' * missing + ':'
                    else:
                        stripped = stripped + ')' * missing + ':'
                    repaired_lines.append(leading + stripped.lstrip())
                    continue

            # Fix: `def foo()` (missing colon) → `def foo():`
            if re.match(r'^\s*(def|class)\s+\w+\(.*\)\s*$', stripped) and not stripped.endswith(':'):
                stripped = stripped.rstrip() + ':'
                repaired_lines.append(leading + stripped.lstrip())
                continue

            # Fix: `if x == 1` / `for x in y` / `while cond` (missing colon)
            if re.match(r'^\s*(if|elif|else|for|while|try|except|finally|with)\b', stripped):
                if not stripped.endswith(':') and not stripped.endswith(':\\'):
                    stripped = stripped.rstrip() + ':'
                    repaired_lines.append(leading + stripped.lstrip())
                    continue

            repaired_lines.append(line)

        return "\n".join(repaired_lines)

    def _find_bad_imports(self, tree: ast.AST) -> dict[int, list[str]]:
        """Helper to identify invalid imports via AST."""
        bad_imports: dict[int, list[str]] = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    top = alias.name.split(".")[0]
                    if not self._is_valid_import(top):
                        name = alias.asname or alias.name.split(".")[-1]
                        bad_imports.setdefault(node.lineno, []).append(name)
            elif isinstance(node, ast.ImportFrom) and node.module:
                top = node.module.split(".")[0]
                if not self._is_valid_import(top):
                    names = [alias.asname or alias.name for alias in node.names]
                    bad_imports.setdefault(node.lineno, []).extend(names)
        return bad_imports

    def _apply_mock_stubs(self, lines: list[str], bad_imports: dict[int, list[str]], code: str) -> list[str]:
        """Helper to comment out bad imports and inject MagicMock stubs."""
        all_stub_names = []
        for line_no, names in sorted(bad_imports.items()):
            idx = line_no - 1
            if 0 <= idx < len(lines):
                lines[idx] = f"# [BIFROST REMOVED] {lines[idx]}"
                all_stub_names.extend(names)

        if not all_stub_names:
            return lines

        stubs = []
        if "MagicMock" not in code and "unittest.mock" not in code:
            stubs.append("from unittest.mock import MagicMock")
        for name in all_stub_names:
            stubs.append(f"{name} = MagicMock(name='{name}')  # [BIFROST STUB]")

        insert_idx = 0
        for i, line in enumerate(lines):
            if line.strip().startswith(("import ", "from ", "# [BIFROST")):
                insert_idx = i + 1

        for j, stub in enumerate(stubs):
            lines.insert(insert_idx + j, stub)
        return lines

    def repair_imports(self, code: str) -> str:
        """Strip bad imports and replace with stubs."""
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return code

        bad_imports = self._find_bad_imports(tree)
        if not bad_imports:
            return code

        lines = code.split("\n")
        lines = self._apply_mock_stubs(lines, bad_imports, code)
        return "\n".join(lines)

    def _is_valid_import(self, top_module: str) -> bool:
        """Check if a top-level module name is valid."""
        if top_module in _KNOWN_THIRD_PARTY:
            return True
        if top_module in self.project_modules:
            return True
        return self._can_import(top_module)

    def scan_and_enrich_imports(self, code: str) -> str:
        """Fetch live documentation for invalid imports."""
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return ""

        bad_modules = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    top = alias.name.split(".")[0]
                    if not self._is_valid_import(top):
                        bad_modules.add(top)
            elif isinstance(node, ast.ImportFrom) and node.module:
                top = node.module.split(".")[0]
                if not self._is_valid_import(top):
                    bad_modules.add(top)

        if not bad_modules:
            return ""

        searcher = BraveSearch()
        if not searcher.is_quota_available():
            return ""

        from src.core.sovereign_hud import SovereignHUD
        context_snippets = []
        processed = set()

        for module in bad_modules:
            if module in processed: continue
            processed.add(module)

            query = f"{module} latest documentation python"
            SovereignHUD.persona_log("INFO", f"Injecting live docs for unknown module: {module}")

            results = searcher.search(query)
            if results:
                snippets = []
                for res in results[:2]:
                    snippets.append(f"- {res.get('title')}: {res.get('description')} ({res.get('url')})")
                if snippets:
                    context_snippets.append(f"Documentation for `{module}`:\n" + "\n".join(snippets))

        if not context_snippets:
            return ""

        return "\n\n[LIVE WEB DOCUMENTATION INJECTED]\n" + "\n\n".join(context_snippets)

    def perform_quarantine_scan(self, code: str, whitelist: list[str] | None = None) -> tuple[bool, str]:
        """Strict AST analysis for new skills."""
        FORBIDDEN_MODULES = {"os", "subprocess", "sys", "socket", "requests", "urllib", "builtins", "importlib"}
        if whitelist:
             FORBIDDEN_MODULES -= set(whitelist)

        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return False, f"Syntax Error: {e!s}"

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.split('.')[0] in FORBIDDEN_MODULES:
                        return False, f"Forbidden import: {alias.name}"
            elif isinstance(node, ast.ImportFrom):
                if node.module and node.module.split('.')[0] in FORBIDDEN_MODULES:
                    return False, f"Forbidden import-from: {node.module}"
            elif isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id == "__import__":
                    return False, "Forbidden dynamic call: __import__"
                if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                    if node.func.value.id == "importlib":
                        return False, "Forbidden dynamic access: importlib"
                if isinstance(node.func, ast.Name):
                    if node.func.id in {"eval", "exec", "compile", "globals", "locals", "getattr", "setattr", "open"}:
                        return False, f"Forbidden dangerous call: {node.func.id}"
            elif isinstance(node, ast.Name):
                if node.id in {"__builtins__"}:
                    return False, f"Forbidden built-in access: {node.id}"
            elif isinstance(node, ast.Attribute):
                if node.attr in {"__class__", "__base__", "__subclasses__"}:
                    return False, f"Forbidden attribute access: {node.attr}"

        return True, "Passed quarantine scan."

    @staticmethod
    def neuter_qmd_document(file_path: Path) -> None:
        """Prevents ACE in Quarto files."""
        if not file_path.exists():
            return
        content = file_path.read_text(encoding='utf-8')
        if re.search(r'^execute:\s*', content, re.MULTILINE):
            if not re.search(r'^execute:\s*false', content, re.MULTILINE):
                content = re.sub(r'^execute:.*$', 'execute: false', content, flags=re.MULTILINE)
                file_path.write_text(content, encoding='utf-8')
            return
        yaml_match = re.search(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
        if yaml_match:
            yaml_block = yaml_match.group(1)
            new_yaml = yaml_block.rstrip() + "\nexecute: false\n"
            content = content.replace(yaml_block, new_yaml)
        else:
            content = "---\nexecute: false\n---\n" + content
        file_path.write_text(content, encoding='utf-8')

    @staticmethod
    def heimdall_guard(text: str) -> str:
        """Neutralize prompt injection patterns."""
        if not text:
            return text
        FORBIDDEN_PATTERNS = [
            (r"(?i)ignore\s+previous\s+instructions", "[REDACTED BY HEIMDALLGUARD]"),
            (r"(?i)you\s+are\s+now\s+an\s+agent\s+of", "[REDACTED BY HEIMDALLGUARD]"),
            (r"(?i)system\s+decree", "[REDACTED BY HEIMDALLGUARD]"),
            (r"(?i)delete\s+all\s+files", "[REDACTED BY HEIMDALLGUARD]"),
            (r"(?i)forget\s+all\s+previous", "[REDACTED BY HEIMDALLGUARD]"),
        ]
        sanitized = text
        for pattern, replacement in FORBIDDEN_PATTERNS:
            sanitized = re.sub(pattern, replacement, sanitized)
        return sanitized

    def sanitize_code(self, code: str) -> str:
        """Full suite of code sanitization and repair."""
        if not code:
            return code
        code = code.replace("\ufeff", "").replace("\x00", "")
        code = self.heimdall_guard(code)
        code = self._strip_markdown_fences(code)
        code = code.replace("\r\n", "\n").replace("\r", "\n")
        code = self._fix_indentation(code)
        if not self._is_syntax_valid(code):
            code = self.repair_syntax(code)
        lines = code.split("\n")
        lines = [line.rstrip() for line in lines]
        code = "\n".join(lines)
        if not code.endswith("\n"):
            code += "\n"
        return code

    def sanitize_test(self, test_code: str, target_file: str) -> str:
        """Test-specific sanitization."""
        test_code = self.sanitize_code(test_code)
        if "sys.path" not in test_code:
            path_setup = (
                "import sys\n"
                "from pathlib import Path\n"
                f"_PROJECT_ROOT = Path(r\"{self.project_root}\").resolve()\n"
                "if str(_PROJECT_ROOT) not in sys.path:\n"
                "    sys.path.insert(0, str(_PROJECT_ROOT))\n\n"
            )
            test_code = path_setup + test_code
        return test_code

    def _strip_markdown_fences(self, code: str) -> str:
        """Remove markdown code fences."""
        patterns = [
            r"^```python\s*\n",
            r"^```json\s*\n",
            r"^```\s*\n",
            r"\n```\s*$",
            r"^```\s*$",
        ]
        for pattern in patterns:
            code = re.sub(pattern, "", code, flags=re.MULTILINE)
        if code.startswith("```"):
            lines = code.split("\n")
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            code = "\n".join(lines)
        return code.strip()

    def _fix_indentation(self, code: str) -> str:
        """Detect and fix common indentation problems."""
        lines = code.split("\n")
        fixed_lines = [line.replace("\t", "    ") for line in lines]
        code = "\n".join(fixed_lines)
        if self._is_syntax_valid(code):
            return code
        return self._deep_fix_indentation(code)

    def _deep_fix_indentation(self, code: str) -> str:
        """Last-resort indentation repair."""
        dedented = textwrap.dedent(code)
        if self._is_syntax_valid(dedented):
            return dedented
        lines = code.split("\n")
        non_empty = [l for l in lines if l.strip()]
        if not non_empty:
            return code
        min_indent = self._find_min_indent(non_empty)
        if min_indent == 0:
            return dedented
        result = self._apply_indent_correction(lines, min_indent)
        if self._is_syntax_valid(result):
            return result
        return dedented

    def _is_syntax_valid(self, code: str) -> bool:
        """Helper to check if code segment parses."""
        try:
            ast.parse(code)
            return True
        except (IndentationError, SyntaxError):
            return False

    def _find_min_indent(self, lines: list[str]) -> int:
        """Finds the minimum non-zero indentation level."""
        indents = []
        for line in lines:
            stripped = line.lstrip()
            indent = len(line) - len(stripped)
            if indent > 0:
                indents.append(indent)
        return min(indents) if indents else 0

    def _apply_indent_correction(self, lines: list[str], min_indent: int) -> str:
        """Strips common indent and rounds to 4-space multiples."""
        fixed_lines = []
        for line in lines:
            if not line.strip():
                fixed_lines.append("")
                continue
            stripped = line.lstrip()
            current_indent = len(line) - len(stripped)
            new_indent = max(0, current_indent - min_indent)
            rounded_indent = (new_indent // 4) * 4
            if current_indent > min_indent:
                rounded_indent = max(4, rounded_indent)
            fixed_lines.append(" " * rounded_indent + stripped)
        return "\n".join(fixed_lines)

    @staticmethod
    def classify_error(error_output: str) -> str:
        """Classify a pytest/execution error into a category."""
        if not error_output:
            return "UNKNOWN"
        error_lower = error_output.lower()
        if "indentationerror" in error_lower:
            return "INDENT"
        if "syntaxerror" in error_lower:
            return "SYNTAX"
        if "modulenotfounderror" in error_lower or "importerror" in error_lower:
            return "IMPORT"
        if "assertionerror" in error_lower:
            return "ASSERTION"
        if "timeoutexpired" in error_lower or "timed out" in error_lower:
            return "TIMEOUT"
        if "nameerror" in error_lower or "attributeerror" in error_lower:
            return "RUNTIME"
        if "typeerror" in error_lower or "valueerror" in error_lower:
            return "RUNTIME"
        return "UNKNOWN"

    @staticmethod
    def extract_error_summary(error_output: str) -> str:
        """Extract a concise, structured error summary."""
        if not error_output:
            return "No error output"
        lines = error_output.strip().splitlines()
        summary_lines = []
        in_summary = False
        for line in lines:
            if "short test summary info" in line:
                in_summary = True
                continue
            if in_summary:
                if line.startswith("="):
                    break
                summary_lines.append(line.strip())
        if summary_lines:
            return " | ".join(summary_lines[:3])
        e_lines = [l.strip() for l in lines if l.strip().startswith("E ")]
        if e_lines:
            return " | ".join(e_lines[:3])
        for line in reversed(lines):
            stripped = line.strip()
            if stripped and not stripped.startswith("=") and not stripped.startswith("-"):
                return stripped[:200]
        return "Unclassifiable error"

# [Ω] Phase 2.1 Complete: Legacy wrappers purged.
