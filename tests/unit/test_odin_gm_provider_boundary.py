from __future__ import annotations

import os

import pytest

from src.games.odin_protocol.engine.gm_client import OdinGM


def test_odin_gm_does_not_activate_from_ambient_provider_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_API_KEY", "synthetic-secret-canary")

    def reject_getenv(*_args: object, **_kwargs: object) -> str:
        raise AssertionError("ambient_environment_read")

    monkeypatch.setattr(os, "getenv", reject_getenv)
    gm = OdinGM(api_key=None)

    assert gm.api_key is None
    assert gm.client is None


def test_odin_gm_retains_explicit_offline_default() -> None:
    gm = OdinGM(api_key=None)

    assert gm.api_key is None
    assert gm.client is None
