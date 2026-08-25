"""Documentation contract for automatic pre-provider Forge continuity."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def flat(relative: str) -> str:
    return " ".join(read(relative).split())


def test_forge_docs_preserve_operator_intent_across_mechanical_failure() -> None:
    playbook = flat("docs/operations/corvus-forge-pipeline-playbook.md")
    specification = flat("docs/operations/corvus-forge-skill-spec.md")
    kernel = flat("docs/integrations/cstar-kernel-mcp.md")

    for text in (playbook, specification, kernel):
        assert "cstar.forge_pre_provider_continuation.v1" in text
        assert "FAILED_RETRYABLE" in text
        assert "mechanical_no_provider" in text
        assert "retry_of_attempt_id" in text
        assert "original" in text and "authorization" in text
        assert "third" in text and "identical" in text
        assert "tenth" in text and "mechanical" in text
        assert "zero provider" in text.replace("-", " ")
        assert "independent" in text and "validation" in text
        assert "continuation-runtime-evidence.json" in text
        assert "same-turn" in text and "revok" in text
        assert "preimage" in text and "STARTED" in text

    assert "Both consume or close the one-shot request" not in playbook
    assert "There is no automatic retry." not in playbook
    assert "A later root-user turn cannot create an attempt." not in playbook
    assert "A later root-user turn can only retrieve an already durable attempt" not in kernel


def test_goal_continuity_never_creates_forge_authority() -> None:
    bootstrap = flat("docs/operations/cstar-goal-driven-daily-bootstrap.md")
    goal_feature = flat("tests/features/cstar_host_goal_resume.feature")
    forge_feature = flat("tests/features/cstar_forge_preprovider_continuation.feature")

    for phrase in (
        "The error should be fixed and the build proceed",
        "grants continuity only",
        "never creates Forge authority",
        "do not ask the operator to repeat the build request",
        "original Forge authorization",
    ):
        assert phrase in bootstrap

    assert "no Forge request, authorization, attempt, provider action, or spend" in goal_feature
    assert "operator is not asked to issue the build request again" in forge_feature
    assert "CStar produces the bounded owner-only continuation-runtime-evidence.json" in forge_feature
    assert "zero provider requests" in forge_feature
    assert "changed trace" in forge_feature
    assert "different thread" in forge_feature
    assert "later revocation" in forge_feature
    assert "appended same-turn revocation" in forge_feature


def test_provider_uncertainty_and_drift_remain_terminal() -> None:
    combined = " ".join((
        flat("docs/operations/corvus-forge-pipeline-playbook.md"),
        flat("docs/operations/corvus-forge-skill-spec.md"),
        flat("tests/features/cstar_forge_preprovider_continuation.feature"),
    ))
    for phrase in (
        "provider start",
        "ambiguous dispatch",
        "unknown spend",
        "live source",
        "scope",
        "lock drift",
        "expiry",
        "revocation",
        "another request",
    ):
        assert phrase in combined
