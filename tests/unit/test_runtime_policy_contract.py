"""Contract tests for the single CStar Node/native runtime definition."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
POLICY = json.loads((ROOT / "runtime-policy.json").read_text(encoding="utf-8"))


def test_runtime_projections_match_the_canonical_policy() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    lock_root = lock["packages"][""]

    assert POLICY["schema"] == "cstar.node-runtime-policy.v1"
    assert package["engines"]["node"] == POLICY["node"]["version"]
    assert lock_root["engines"]["node"] == POLICY["node"]["version"]
    assert package["dependencies"][POLICY["native"]["dependency"]] == POLICY["native"]["version"]
    assert lock_root["dependencies"][POLICY["native"]["dependency"]] == POLICY["native"]["version"]
    assert (ROOT / ".nvmrc").read_text(encoding="utf-8").strip() == POLICY["node"]["version"]


def test_ci_and_release_use_the_policy_projection_and_validation() -> None:
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    release = (ROOT / ".github" / "workflows" / "distribution-release.yml").read_text(encoding="utf-8")
    docs = (ROOT / "docs" / "operations" / "cstar-node-runtime-policy.md").read_text(encoding="utf-8")

    for workflow in (ci, release):
        assert "node-version-file: .nvmrc" in workflow
        assert "node-version: 20" not in workflow
        assert "node-version: 22" not in workflow
        assert "npm install --legacy-peer-deps" not in workflow
        assert "npm run validate:runtime" in workflow
    for value in (
        POLICY["node"]["version"],
        POLICY["node"]["node_module_version"],
        POLICY["node"]["napi_version"],
        POLICY["npm"],
        POLICY["native"]["version"],
    ):
        assert value in docs
