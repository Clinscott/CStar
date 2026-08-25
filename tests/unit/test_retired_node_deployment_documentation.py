from pathlib import Path


ROOT = Path(__file__).parents[2]


def test_legacy_node_deployment_is_documented_as_operator_gated_retirement():
    text = (ROOT / "docs/operations/retired-node-deployment-surface.md").read_text(
        encoding="utf-8"
    )
    assert "fail-closed compatibility tombstone" in text
    assert "legacy_node_deployment_retired_use_operator_gated_cstar_git_closure" in text
    assert "staging, commit, push, pull-request creation, and merge" in text
