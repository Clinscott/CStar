from pathlib import Path
import sys

from src.core.runtime_env import resolve_project_python


def test_resolve_project_python_prefers_unix_venv_when_present(tmp_path: Path) -> None:
    python_path = tmp_path / ".venv" / "bin" / "python"
    python_path.parent.mkdir(parents=True, exist_ok=True)
    python_path.write_text("", encoding="utf-8")

    assert resolve_project_python(tmp_path) == python_path


def test_resolve_project_python_falls_back_to_sys_executable(tmp_path: Path) -> None:
    assert resolve_project_python(tmp_path) == Path(sys.executable)
