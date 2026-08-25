from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_state_registry_mutation_boundary_is_current_and_fail_closed() -> None:
    documentation = (ROOT / "docs/operations/retired-state-registry-mutation-boundary.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_retired_state_registry_mutation.feature").read_text(
        encoding="utf-8"
    )
    for required in (
        "read-only compatibility view",
        "legacy_state_registry_mutation_retired_use_cstar_kernel",
        ".agents/sovereign_state.json",
        "request-classified `cstar-kernel` lifecycle tool",
    ):
        assert required in documentation
    assert "legacy_state_registry_mutation_retired_use_cstar_kernel" in feature
    assert "no Hall filesystem blackboard spoke presence or coordination effect" in feature
