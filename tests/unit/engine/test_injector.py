from unittest.mock import MagicMock, patch

from src.core.engine.injector import SovereignInjector
from src.tools.brave_search import BraveSearch


def injector(tmp_path):
    instance = SovereignInjector.__new__(SovereignInjector)
    instance.project_root = tmp_path
    instance.thresholds = {"REC": 1.5}
    instance.skills_db_path = tmp_path / "skills_db"
    return instance


@patch("src.core.engine.injector.BraveSearch")
def test_proactive_lexicon_lift_uses_brave_search(mock_brave_class, tmp_path):
    subject = injector(tmp_path)
    engine = MagicMock(vocab={"explain"}, stopwords=set())
    mock_brave_class.return_value.search.return_value = [
        {"description": "A bounded technical definition."}
    ]

    subject.proactive_lexicon_lift("Explain frobnicator", engine)

    mock_brave_class.return_value.search.assert_called_once_with(
        "Technical definition and synonyms for frobnicator"
    )
    engine.add_skill.assert_called_once_with(
        "LEXICON:frobnicator",
        "A bounded technical definition.",
        domain="GENERAL",
    )


@patch("src.core.engine.injector.BraveSearch")
def test_proactive_lexicon_lift_empty_result_is_noop(mock_brave_class, tmp_path):
    subject = injector(tmp_path)
    engine = MagicMock(vocab={"explain"}, stopwords=set())
    mock_brave_class.return_value.search.return_value = []

    subject.proactive_lexicon_lift("Explain frobnicator", engine)

    mock_brave_class.return_value.search.assert_called_once()
    engine.add_skill.assert_not_called()


def test_proactive_lexicon_lift_without_credentials_is_side_effect_free(
    monkeypatch,
    tmp_path,
):
    subject = injector(tmp_path)
    engine = MagicMock(vocab={"explain"}, stopwords=set())
    blocked_parent = tmp_path / "not-a-directory"
    blocked_parent.write_text("blocked", encoding="utf-8")
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)
    monkeypatch.setattr(
        BraveSearch,
        "QUOTA_FILE",
        blocked_parent / "brave_quota.json",
    )
    network_get = MagicMock(side_effect=AssertionError("network call was not expected"))
    monkeypatch.setattr("src.tools.brave_search.requests.get", network_get)

    subject.proactive_lexicon_lift("Explain frobnicator", engine)

    network_get.assert_not_called()
    engine.add_skill.assert_not_called()
