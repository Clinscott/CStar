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


def validate_syntax(code: str) -> tuple[bool, str]:
    """Parse code with ast.parse(). Returns (is_valid, error_message)."""
    if not code or not code.strip():
        return False, "Empty code"
    try:
        ast.parse(code)
        return True, ""
    except SyntaxError as e:
        return False, f"SyntaxError at line {e.lineno}: {e.msg}"


def _get_project_modules(project_root: Path) -> set[str]:
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

def _check_import_node(node: ast.AST, project_modules: set[str]) -> list[str]:
    """Helper to validate a single import node."""
    bad_imports = []
    if isinstance(node, ast.Import):
        for alias in node.names:
            top = alias.name.split(".")[0]
            if top not in _KNOWN_THIRD_PARTY and top not in project_modules:
                if not _can_import(top):
                    bad_imports.append(f"line {node.lineno}: `import {alias.name}` — '{top}' is not a known module")
    elif isinstance(node, ast.ImportFrom):
        if node.module:
            top = node.module.split(".")[0]
            if top not in _KNOWN_THIRD_PARTY and top not in project_modules:
                if not _can_import(top):
                    bad_imports.append(f"line {node.lineno}: `from {node.module} import ...` — '{top}' is not a known module")
    elif isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name) and node.func.id == "__import__":
            bad_imports.append(f"line {node.lineno}: Forbidden dynamic import `__import__` detected.")
        elif isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
            if node.func.value.id == "importlib":
                bad_imports.append(f"line {node.lineno}: Forbidden dynamic import `importlib` detected.")
    return bad_imports

def validate_imports(code: str, project_root: Path) -> list[str]:
    """
    AST-walk import statements and flag any that cannot resolve.
    Returns a list of bad import descriptions.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return ["Code has syntax errors — cannot validate imports"]

    bad_imports = []
    project_modules = _get_project_modules(project_root)
    for node in ast.walk(tree):
        bad_imports.extend(_check_import_node(node, project_modules))

    return bad_imports


def _can_import(module_name: str) -> bool:
    """Check if a module can be imported without side effects."""
    try:
        spec = importlib.util.find_spec(module_name)
        return spec is not None
    except (ModuleNotFoundError, ValueError):
        return False


def repair_syntax(code: str) -> str:
    """
    Attempt to repair common AI-generated syntax errors:
    - Missing closing parens in def/class signatures
    - Missing colons after def/class/if/for/while
    - Unmatched brackets
    Returns repaired code (may still be invalid — caller should re-validate).
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
            # Count parens
            open_parens = stripped.count('(')
            close_parens = stripped.count(')')
            if open_parens > close_parens:
                missing = open_parens - close_parens
                # Add missing close parens before the colon (or at end)
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


def _find_bad_imports(tree: ast.AST, project_root: Path) -> dict[int, list[str]]:
    """Helper to identify invalid imports via AST."""
    bad_imports: dict[int, list[str]] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if not _is_valid_import(top, project_root):
                    name = alias.asname or alias.name.split(".")[-1]
                    bad_imports.setdefault(node.lineno, []).append(name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                top = node.module.split(".")[0]
                if not _is_valid_import(top, project_root):
                    names = [alias.asname or alias.name for alias in node.names]
                    bad_imports.setdefault(node.lineno, []).extend(names)
    return bad_imports

def _apply_mock_stubs(lines: list[str], bad_imports: dict[int, list[str]], code: str) -> list[str]:
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

def repair_imports(code: str, project_root: Path) -> str:
    """
    Strip bad imports and replace imported names with MagicMock stubs.
    This allows the rest of the code to run even when the AI invents modules.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return code

    bad_imports = _find_bad_imports(tree, project_root)
    if not bad_imports:
        return code

    lines = code.split("\n")
    lines = _apply_mock_stubs(lines, bad_imports, code)
    return "\n".join(lines)


def _is_valid_import(top_module: str, project_root: Path) -> bool:
    """Check if a top-level module name is valid (stdlib, third-party, or project)."""
    if top_module in _KNOWN_THIRD_PARTY:
        return True

    # Check project modules
    src_dir = project_root / "src"
    if src_dir.exists():
        for p in src_dir.iterdir():
            if p.is_dir() and p.name == top_module:
                return True
            if p.suffix == ".py" and p.stem == top_module:
                return True

    return _can_import(top_module)


# ==============================================================================
# 🔨 SANITIZATION (Auto-Repair)
# ==============================================================================


# ==============================================================================
# 🧠 KNOWLEDGE INJECTION
# ==============================================================================


def scan_and_enrich_imports(code: str, project_root: Path) -> str:
    """
    Scans for invalid imports and fetches live documentation via BraveSearch.
    Returns a documentation string to be injected into the LLM context.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return ""

    bad_modules = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if not _is_valid_import(top, project_root):
                    bad_modules.add(top)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                top = node.module.split(".")[0]
                if not _is_valid_import(top, project_root):
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

def perform_quarantine_scan(code: str, whitelist: list[str] | None = None) -> tuple[bool, str]:
    """
    Strict AST analysis for new skills. 
    Blocks restricted modules and dynamic import attempts.
    """
    FORBIDDEN_MODULES = {"os", "subprocess", "sys", "socket", "requests", "urllib", "builtins", "importlib"}
    if whitelist:
         FORBIDDEN_MODULES -= set(whitelist)

    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return False, f"Syntax Error: {e!s}"

    for node in ast.walk(tree):
        # Check standard imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split('.')[0] in FORBIDDEN_MODULES:
                    return False, f"Forbidden import: {alias.name}"
        elif isinstance(node, ast.ImportFrom):
            if node.module and node.module.split('.')[0] in FORBIDDEN_MODULES:
                return False, f"Forbidden import-from: {node.module}"

        # Check dynamic import calls and built-in manipulation
        elif isinstance(node, ast.Call):
            # __import__
            if isinstance(node.func, ast.Name) and node.func.id == "__import__":
                return False, "Forbidden dynamic call: __import__"
            # importlib
            if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                if node.func.value.id == "importlib":
                    return False, "Forbidden dynamic access: importlib"

            # eval, exec, compile, globals, locals, etc.
            if isinstance(node.func, ast.Name):
                if node.func.id in {"eval", "exec", "compile", "globals", "locals", "getattr", "setattr", "open"}:
                    return False, f"Forbidden dangerous call: {node.func.id}"

        # Check Name nodes for builtins access
        elif isinstance(node, ast.Name):
            if node.id in {"__builtins__"}:
                return False, f"Forbidden built-in access: {node.id}"

        # Check Attribute nodes for MRO traversal
        elif isinstance(node, ast.Attribute):
            if node.attr in {"__class__", "__base__", "__subclasses__"}:
                return False, f"Forbidden attribute access: {node.attr}"

    return True, "Passed quarantine scan."

def neuter_qmd_document(file_path: Path):
    """
    Prevents Arbitrary Code Execution (ACE) in Quarto files by forcing execute: false.
    """
    if not file_path.exists():
        return

    content = file_path.read_text(encoding='utf-8')
    # Use re.MULTILINE to find any entry of execute:
    if re.search(r'^execute:\s*', content, re.MULTILINE):
        # Already has an execute key, force it to false if it's not already
        if not re.search(r'^execute:\s*false', content, re.MULTILINE):
            content = re.sub(r'^execute:.*$', 'execute: false', content, flags=re.MULTILINE)
            file_path.write_text(content, encoding='utf-8')
        return

    # Check for existing YAML frontmatter to inject into
    yaml_match = re.search(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)

    if yaml_match:
        yaml_block = yaml_match.group(1)
        new_yaml = yaml_block.rstrip() + "\nexecute: false\n"
        content = content.replace(yaml_block, new_yaml)
    else:
        content = "---\nexecute: false\n---\n" + content

    file_path.write_text(content, encoding='utf-8')


# ==============================================================================
# 🛡️ HEIMDALLGUARD (Security Sanitization)
# ==============================================================================


def heimdall_guard(text: str) -> str:
    """
    Neutralize prompt injection patterns in external snippets.
    Treats external data as 'Guilty until Proven Innocent'.
    """
    if not text:
        return text

    # [BIFRÖST] Prompt Injection Denials
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


def sanitize_code(code: str) -> str:
    """
    Attempt to repair common AI-generated code issues:
    1. Strip markdown fences
    2. Remove BOM / null bytes
    3. Fix indentation
    4. Repair syntax (missing parens, colons)
    5. Strip trailing whitespace
    """
    if not code:
        return code

    # 1. Remove BOM and null bytes
    code = code.replace("\ufeff", "").replace("\x00", "")

    # [BIFRÖST] 1b. Apply HeimdallGuard to external data (if snippet looks like text/code)
    code = heimdall_guard(code)

    # 2. Strip markdown code fences
    code = _strip_markdown_fences(code)

    # 3. Normalize line endings
    code = code.replace("\r\n", "\n").replace("\r", "\n")

    # 4. Fix indentation issues
    code = _fix_indentation(code)

    # 5. Attempt syntax repair if still broken
    try:
        ast.parse(code)
    except SyntaxError:
        code = repair_syntax(code)

    # 6. Strip trailing whitespace per line
    lines = code.split("\n")
    lines = [line.rstrip() for line in lines]
    code = "\n".join(lines)

    # 7. Ensure file ends with newline
    if not code.endswith("\n"):
        code += "\n"

    return code


def sanitize_test(test_code: str, target_file: str, project_root: Path) -> str:
    """
    Test-specific sanitization:
    1. Inject sys.path setup if missing
    2. Replace bare module imports with src-prefixed imports
    3. Ensure encoding='utf-8' on file operations
    """
    test_code = sanitize_code(test_code)

    # Inject sys.path boilerplate if not present
    if "sys.path" not in test_code:
        path_setup = (
            "import sys\n"
            "from pathlib import Path\n"
            f"_PROJECT_ROOT = Path(r\"{project_root}\").resolve()\n"
            "if str(_PROJECT_ROOT) not in sys.path:\n"
            "    sys.path.insert(0, str(_PROJECT_ROOT))\n\n"
        )
        # Insert after any existing imports at the top
        test_code = path_setup + test_code

    return test_code


def _strip_markdown_fences(code: str) -> str:
    """Remove ```python, ```json, ``` fences from AI output."""
    # Pattern: ```python\n ... \n```
    patterns = [
        r"^```python\s*\n",
        r"^```json\s*\n",
        r"^```\s*\n",
        r"\n```\s*$",
        r"^```\s*$",
    ]
    for pattern in patterns:
        code = re.sub(pattern, "", code, flags=re.MULTILINE)

    # Also handle inline: if entire code is wrapped in fences
    if code.startswith("```"):
        lines = code.split("\n")
        # Remove first and last fence lines
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        code = "\n".join(lines)

    return code.strip()


def _fix_indentation(code: str) -> str:
    """
    Detect and fix common indentation problems:
    - Mixed tabs and spaces
    - Inconsistent indent levels
    - textwrap.dedent artifacts
    """
    lines = code.split("\n")
    fixed_lines = []

    for line in lines:
        # Replace tabs with 4 spaces
        line = line.replace("\t", "    ")
        fixed_lines.append(line)

    code = "\n".join(fixed_lines)

    # Try to parse — if it fails with IndentationError, attempt deeper fix
    try:
        ast.parse(code)
        return code
    except IndentationError:
        return _deep_fix_indentation(code)
    except SyntaxError:
        return code  # Not an indentation issue


def _deep_fix_indentation(code: str) -> str:
    """
    Last-resort indentation repair.
    Attempts simple dedent, then line-by-line normalization.
    """
    # 1. Try simple dedent
    dedented = textwrap.dedent(code)
    if _is_syntax_valid(dedented):
        return dedented

    # 2. Try line-by-line normalization
    lines = code.split("\n")
    non_empty = [l for l in lines if l.strip()]
    if not non_empty:
        return code

    min_indent = _find_min_indent(non_empty)
    if min_indent == 0:
        return dedented # Fallback

    result = _apply_indent_correction(lines, min_indent)

    if _is_syntax_valid(result):
        return result

    return dedented

def _is_syntax_valid(code: str) -> bool:
    """Helper to check if code segment parses."""
    try:
        ast.parse(code)
        return True
    except (IndentationError, SyntaxError):
        return False

def _find_min_indent(lines: list[str]) -> int:
    """Finds the minimum non-zero indentation level."""
    indents = []
    for line in lines:
        stripped = line.lstrip()
        indent = len(line) - len(stripped)
        if indent > 0:
            indents.append(indent)
    return min(indents) if indents else 0

def _apply_indent_correction(lines: list[str], min_indent: int) -> str:
    """Strips common indent and rounds to 4-space multiples."""
    fixed_lines = []
    for line in lines:
        if not line.strip():
            fixed_lines.append("")
            continue

        stripped = line.lstrip()
        current_indent = len(line) - len(stripped)
        new_indent = max(0, current_indent - min_indent)

        # Round to nearest 4-space multiple and preserve structure
        rounded_indent = (new_indent // 4) * 4
        if current_indent > min_indent:
            rounded_indent = max(4, rounded_indent)

        fixed_lines.append(" " * rounded_indent + stripped)
    return "\n".join(fixed_lines)


# ==============================================================================
# 📊 DIAGNOSTIC CLASSIFICATION
# ==============================================================================


def classify_error(error_output: str) -> str:
    """
    Classify a pytest/execution error into a category.
    Returns one of: SYNTAX, INDENT, IMPORT, RUNTIME, ASSERTION, TIMEOUT, UNKNOWN
    """
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


def extract_error_summary(error_output: str) -> str:
    """
    Extract a concise, structured error summary from raw pytest output.
    Much better than truncating to 1000 chars.
    """
    if not error_output:
        return "No error output"

    lines = error_output.strip().splitlines()

    # Look for the "short test summary info" section
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

    # Fallback: look for E lines (pytest assertion/error lines)
    e_lines = [l.strip() for l in lines if l.strip().startswith("E ")]
    if e_lines:
        return " | ".join(e_lines[:3])

    # Last fallback: last meaningful line
    for line in reversed(lines):
        stripped = line.strip()
        if stripped and not stripped.startswith("=") and not stripped.startswith("-"):
            return stripped[:200]

    return "Unclassifiable error"
