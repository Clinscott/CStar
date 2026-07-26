from __future__ import annotations

import ast
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RETIRED_MODULES = frozenset({"google.genai", "google.generativeai"})
RETIRED_DISTRIBUTIONS = frozenset({"google-genai", "google-generativeai"})


def _canonical_distribution_name(requirement: str) -> str:
    match = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9_.-]*)", requirement)
    assert match is not None, f"Could not parse dependency declaration: {requirement!r}"
    return re.sub(r"[-_.]+", "-", match.group(1)).lower()


def _retired_imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imports: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.extend(
                alias.name
                for alias in node.names
                if any(
                    alias.name == module or alias.name.startswith(f"{module}.")
                    for module in RETIRED_MODULES
                )
            )
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if any(
                module == retired or module.startswith(f"{retired}.")
                for retired in RETIRED_MODULES
            ):
                imports.append(module)
            elif module == "google":
                imports.extend(
                    f"google.{alias.name}"
                    for alias in node.names
                    if f"google.{alias.name}" in RETIRED_MODULES
                )

    return imports


def _project_dependencies() -> set[str]:
    content = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r"(?ms)^dependencies\s*=\s*(\[[^\]]*\])", content)
    assert match is not None, "pyproject.toml is missing [project].dependencies"
    dependencies = ast.literal_eval(match.group(1))
    return {_canonical_distribution_name(dependency) for dependency in dependencies}


def _requirements_dependencies() -> set[str]:
    dependencies = set()
    for raw_line in (ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines():
        line = raw_line.partition("#")[0].strip()
        if line and not line.startswith("-"):
            dependencies.add(_canonical_distribution_name(line))
    return dependencies


def test_supported_python_source_has_no_retired_google_sdk_imports() -> None:
    violations = {
        str(path.relative_to(ROOT)): imports
        for path in sorted((ROOT / "src").rglob("*.py"))
        if (imports := _retired_imports(path))
    }

    assert violations == {}


def test_python_manifests_do_not_declare_retired_google_sdks() -> None:
    violations = {
        "pyproject.toml": sorted(_project_dependencies() & RETIRED_DISTRIBUTIONS),
        "requirements.txt": sorted(
            _requirements_dependencies() & RETIRED_DISTRIBUTIONS
        ),
    }

    assert {manifest: packages for manifest, packages in violations.items() if packages} == {}
