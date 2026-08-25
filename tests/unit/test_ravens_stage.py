from src.core.engine.ravens_stage import (
    RavensCycleResult,
    RavensHallReferenceSet,
    RavensStageResult,
    RavensTargetIdentity,
)


def test_ravens_stage_contract_serializes_nested_references() -> None:
    result = RavensCycleResult(
        status="SUCCESS",
        summary="Cycle complete.",
        mission_id="ravens-cycle:test",
        target=RavensTargetIdentity(target_path="src/core/sample.py", rationale="Repair sample path"),
        hall=RavensHallReferenceSet(repo_id="repo:test", observation_id="obs:test"),
        stages=[
            RavensStageResult(
                stage="hunt",
                status="SUCCESS",
                summary="Target selected.",
                target=RavensTargetIdentity(target_path="src/core/sample.py"),
                hall=RavensHallReferenceSet(repo_id="repo:test", observation_id="obs:hunt"),
            )
        ],
    )

    payload = result.to_dict()
    assert payload["target"]["target_path"] == "src/core/sample.py"
    assert payload["hall"]["observation_id"] == "obs:test"
    assert payload["stages"][0]["stage"] == "hunt"
