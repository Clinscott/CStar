"""Static contracts for hardened Gemini CLI workflows."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_ROOT = ROOT / ".github" / "workflows"
COMMAND_ROOT = ROOT / ".github" / "commands"
NAMES = (
    "gemini-review",
    "gemini-invoke",
    "gemini-plan-execute",
    "gemini-triage",
    "gemini-scheduled-triage",
)


def _workflow(name: str) -> str:
    return (WORKFLOW_ROOT / f"{name}.yml").read_text(encoding="utf-8")


def _command(name: str) -> str:
    return (COMMAND_ROOT / f"{name}.toml").read_text(encoding="utf-8")


def test_trust_is_step_local_and_shell_tools_are_absent() -> None:
    for name in NAMES:
        workflow = _workflow(name)
        assert workflow.count("GEMINI_CLI_TRUST_WORKSPACE: 'true'") == 1, name
        assert "run_shell_command(" not in workflow, name
        assert '"core": []' in workflow, name
        assert "persist-credentials: false" in workflow, name
        assert "github-token: ''" in workflow, name
        assert (
            "actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8"
            in workflow
        ), name
        assert not re.search(r"uses:\s*['\"]?actions/checkout@v", workflow), name


def test_commands_consume_bounded_json_without_shell_interpolation() -> None:
    for name in NAMES:
        command = _command(name)
        assert "@{.gemini/context.json}" in command, name
        assert "!{" not in command, name
        assert "$GITHUB_ENV" not in command, name


def test_untrusted_triage_is_tokenless_and_effects_are_deterministic() -> None:
    triage = _workflow("gemini-triage")
    scheduled = _workflow("gemini-scheduled-triage")

    assert "selected_labels: '${{ steps.gemini_analysis.outputs.summary }}'" in triage
    assert "triaged_issues: '${{ steps.gemini_issue_analysis.outputs.summary }}'" in scheduled
    assert "GITHUB_TOKEN: '' # Do NOT pass any auth tokens" in triage
    assert "GITHUB_TOKEN: '' # Do not pass any auth token" in scheduled
    assert "ALLOWED_ISSUE_NUMBERS" in scheduled
    assert "allowedIssueNumbers.has(issueNumber)" in scheduled
    assert "Number.isSafeInteger(issueNumber)" in scheduled
    assert "parsed.length > 100" in scheduled
    assert "issue.explanation" not in scheduled


def test_plan_approval_remains_a_read_only_cstar_forge_handoff() -> None:
    workflow = _workflow("gemini-plan-execute")
    command = _command("gemini-plan-execute")
    dispatch = _workflow("gemini-dispatch")

    assert "contents: 'write'" not in workflow
    assert "permission-contents: 'write'" not in workflow
    assert "You never implement, commit, push, deploy, or bypass Corvus Forge" in command
    assert "needs.dispatch.outputs.command == 'approve'" in dispatch
    plan_block = dispatch.split("  plan-execute:", 1)[1].split("  fallthrough:", 1)[0]
    assert "contents: 'read'" in plan_block
    assert "contents: 'write'" not in plan_block
