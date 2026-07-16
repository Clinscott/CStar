"""Contract ensuring Node test discovery is complete and cross-version safe."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_node_script_uses_the_complete_kernel_test_glob_without_retired_crucible() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    command = package["scripts"]["test:node"]

    assert "--test-concurrency=2" in command
    assert "tests/unit/cstar-kernel-mcp/*.test.ts" in command
    assert "tests/unit/cstar-kernel-mcp/test_codex_request_identity.test.ts" not in command
    assert "tests/crucible/*.ts" not in command
    assert not list((ROOT / "tests" / "crucible").glob("*.ts"))
