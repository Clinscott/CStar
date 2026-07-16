from __future__ import annotations

from pathlib import Path

import pytest

from src.tools.debug import check_pro


def test_script_fails_closed_before_provider_or_secret_access(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GOOGLE_API_KEY", "synthetic-provider-canary")

    assert check_pro.main() == 1
    assert capsys.readouterr().err == (
        f"{check_pro.RETIRED_SECRET_PROVIDER_TOOL_ERROR}\n"
    )
    assert list(tmp_path.rglob("*")) == []


def test_provider_accessor_and_dotenv_hook_return_stable_retirement_error() -> None:
    for action in (check_pro._require_genai, check_pro.load_dotenv):
        with pytest.raises(
            RuntimeError,
            match=f"^{check_pro.RETIRED_SECRET_PROVIDER_TOOL_ERROR}$",
        ):
            action()
