import sys

from src.skills.local.drafts.workflow_backup_sequence_steps_gen.backup_sequence_steps import main


def test_backup_sequence_steps_main(capsys, monkeypatch):
    """Verifies that the draft workflow runs its mock steps."""
    monkeypatch.setattr(sys, "argv", ["script.py", "--input", "test.txt"])
    main()
    captured = capsys.readouterr()
    assert "[STEP 1] Loading test.txt..." in captured.out
    assert "[DONE] Workflow complete." in captured.out
