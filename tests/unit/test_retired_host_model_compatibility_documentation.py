from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / "docs" / "operations" / "retired-host-model-compatibility.md"
FEATURE = ROOT / "tests" / "features" / "cstar_retired_host_model_compatibility.feature"


def test_retired_host_model_documentation_names_all_stable_failures() -> None:
    text = DOC.read_text(encoding="utf-8")
    normalized = " ".join(text.split())
    for failure in (
        "legacy_one_mind_compatibility_retired_use_cstar_kernel",
        "legacy_host_provider_delegation_retired_use_cstar_kernel",
        "legacy_agent_native_dispatch_retired_use_host_skill_surface",
        "legacy_blackboard_compaction_retired_use_cstar_kernel",
        "legacy_environment_adapter_retired_use_host_enforceable_capabilities",
    ):
        assert failure in text
    assert (
        "cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> independent cstar_record_result"
        in text
    )
    assert "cannot infer subagent or JIT capability" in normalized


def test_retired_host_model_feature_requires_zero_effects() -> None:
    text = FEATURE.read_text(encoding="utf-8")
    assert "all effect flags are false" in text
    assert "no Hall, Synapse, StateRegistry, provider, process, source, or callback is touched" in text
