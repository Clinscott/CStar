import pytest

from src.tools.debug import audit_dialogue


def test_audit_dialogue_is_a_retired_engine_consumer() -> None:
    with pytest.raises(RuntimeError, match=f"^{audit_dialogue.RETIREMENT_ERROR}$"):
        audit_dialogue.DialogueAuditor(persona="SYNTHETIC")


def test_audit_dialogue_main_fails_closed() -> None:
    with pytest.raises(RuntimeError, match=f"^{audit_dialogue.RETIREMENT_ERROR}$"):
        audit_dialogue.main()
