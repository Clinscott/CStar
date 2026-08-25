import pytest

from src.cstar.core.uplink import (
    LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR,
    AntigravityUplink,
    clean_cli_output,
)


def test_cli_output_parser_remains_detached():
    raw = "\x1B[31mwarning\x1B[0m {\"status\": \"ok\"} trailer"
    assert clean_cli_output(raw) == '{"status": "ok"}'


def test_direct_uplink_is_retired_before_provider_access():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        AntigravityUplink()
