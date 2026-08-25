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


def test_goal_resume_public_and_historical_documentation_boundaries() -> None:
    kernel = read("docs/integrations/cstar-kernel-mcp.md")
    start = kernel.index("## 8. `cstar_goal_resume`")
    end = kernel.index("\n## 9. `cstar_spoke_bead_import`", start)
    section = kernel[start:end]
    historical_marker = "Historical internal-only compatibility facts"
    historical_start = section.index(historical_marker)
    public = " ".join(section[:historical_start].split())
    historical = " ".join(section[historical_start:].split())

    for phrase in (
        "forge_request_receipt_id", "request_sha256", "host_goal_projection",
        "cstar.host_get_goal_projection.v1", "schema", "threadId", "objective", "status",
        "tokensUsed", "timeUsedSeconds", "createdAt", "updatedAt", "hostResumeCapability",
        "exact UTF-8 bytes without trim or Unicode normalization",
        "Raw objective text and transient counters are not durably persisted",
        "goal-resume-v2:<64 lowercase hex>", "continuity_only", "host_status_mutated: false",
        "creates no new provider call, spend, Forge request, authorization, or attempt",
        "does not inherit protected-gate authority",
    ):
        assert phrase in public

    for phrase in (
        "The sidecar is `cstar.forge_request_root_repair_binding.v1`",
        "Current-v3 stores its semantic `adapter_ref` as null",
        "older NOT NULL column transactionally",
        "historical non-null adapter values byte-for-byte",
        "Legacy-v2 adapter selection remains explicit compatibility state",
        "never a current-v3 sidecar fallback",
    ):
        assert phrase in public

    for phrase in (
        "goal-resume:<64 lowercase hex>", "repair_bead_id", "continued_bead_id", "decision_id",
        "host_goal_objective_sha256", "host_goal_snapshot_sha256", "observed_host_status",
        "host_resume_capability", "forge_goal_resume_v1_historical_only",
        "These fields are not accepted by the current public registration or Forge authorization",
    ):
        assert phrase in historical
        assert phrase not in public


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
