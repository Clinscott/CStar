from types import SimpleNamespace

import pytest

from src.core.engine.skill_learning import (
    LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR,
    _build_proposed_contract,
    _bump_contract_version,
    materialize_skill_proposal,
    promote_skill_proposal,
)


def test_detached_contract_helpers_remain_pure():
    source = {"version": "1.0", "defaults": {"simulate": True}}
    proposed = _build_proposed_contract(
        source, focus_axes=["logic"], validation_profile="strict"
    )
    assert source["version"] == "1.0"
    assert proposed["version"] == "1.1"
    assert proposed["defaults"]["focus_axes"] == ["logic"]
    assert _bump_contract_version("bad") == "1.1"


@pytest.mark.parametrize(
    "invoke",
    [
        lambda: materialize_skill_proposal(SimpleNamespace()),
        lambda: promote_skill_proposal("synthetic", "proposal:test"),
    ],
)
def test_skill_lifecycle_actions_are_retired(invoke):
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR}$"):
        invoke()
