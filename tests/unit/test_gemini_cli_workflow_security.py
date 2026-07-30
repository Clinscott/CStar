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
CONTEXT_STEPS = {
    "gemini-review": "Prepare bounded review context",
    "gemini-invoke": "Prepare bounded invocation context",
    "gemini-plan-execute": "Prepare bounded planning context",
    "gemini-triage": "Prepare bounded issue context",
    "gemini-scheduled-triage": "Prepare bounded scheduled-triage context",
}


def _workflow(name: str) -> str:
    return (WORKFLOW_ROOT / f"{name}.yml").read_text(encoding="utf-8")


def _command(name: str) -> str:
    return (COMMAND_ROOT / f"{name}.toml").read_text(encoding="utf-8")


def _step(workflow: str, name: str) -> str:
    marker = f"      - name: '{name}'"
    start = workflow.index(marker)
    end = workflow.find("\n      - name: ", start + len(marker))
    return workflow[start:] if end == -1 else workflow[start:end]


def test_trust_is_step_local_and_shell_tools_are_absent() -> None:
    for name in NAMES:
        workflow = _workflow(name)
        assert workflow.count("GEMINI_CLI_TRUST_WORKSPACE: 'true'") == 1, name
        assert "run_shell_command(" not in workflow, name
        assert '"core": []' in workflow, name
        assert "persist-credentials: false" in workflow, name
        assert "github-token: ''" not in workflow, name
        assert (
            "actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8"
            in workflow
        ), name
        assert not re.search(r"uses:\s*['\"]?actions/checkout@v", workflow), name


def test_context_writers_are_direct_tokenless_node_steps() -> None:
    for workflow_name, step_name in CONTEXT_STEPS.items():
        workflow = _workflow(workflow_name)
        step = _step(workflow, step_name)

        assert "run: |-" in step, workflow_name
        assert "node --input-type=module <<'NODE'" in step, workflow_name
        assert "uses:" not in step, workflow_name
        assert "actions/github-script" not in step, workflow_name
        assert "github-token:" not in step, workflow_name
        assert "GITHUB_TOKEN:" not in step, workflow_name
        assert "fs.writeFileSync('.gemini/context.json'" in step, workflow_name


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
    triage_analysis = _step(triage, "Run Gemini issue analysis")
    scheduled_analysis = _step(scheduled, "Run Gemini Issue Analysis")
    assert triage_analysis.count("GITHUB_TOKEN: ''") == 1
    assert scheduled_analysis.count("GITHUB_TOKEN: ''") == 1
    assert "google-github-actions/run-gemini-cli@v0" in triage_analysis
    assert "google-github-actions/run-gemini-cli@v0" in scheduled_analysis
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
