import json
import subprocess
import sys
from pathlib import Path

from src.synapse.synapse_auth import authenticate_sync


ROOT = Path(__file__).resolve().parents[2]


def test_legacy_synapse_cli_fails_closed() -> None:
    result = subprocess.run(
        [sys.executable, "src/synapse/synapse_sync.py", "--pull"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 78
    assert "legacy_synapse_sync_retired_use_cstar_kernel_hall" in result.stderr


def test_legacy_auth_never_grants_authority() -> None:
    assert authenticate_sync("ALFRED") is False


def test_tracked_agent_config_contains_no_secret_field() -> None:
    config = json.loads((ROOT / ".agents" / "config.json").read_text(encoding="utf-8"))
    assert "security" not in config
    assert "neural_secret" not in json.dumps(config)
