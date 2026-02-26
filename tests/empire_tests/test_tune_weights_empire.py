import unittest.mock as mock

from src.tools.tune_weights import MetaLearner


def test_meta_learner_logic():
    # Mock SovereingVector
    mock_engine = mock.MagicMock()
    # Mocking tokenize: return words
    mock_engine.tokenize.side_effect = lambda x: x.split()
    # Mock skills
    mock_engine.skills = {
        "target": "goal objective",
        "rival": "goal wrong"
    }
    # Mock thesaurus
    mock_engine.thesaurus = {"goal": {"goal": 1.0}, "wrong": {"wrong": 1.0}}

    learner = MetaLearner(mock_engine)

    # Query: "goal wrong" -> matches rival (wrong) but expected target (objective)
    actual = {"trigger": "rival", "score": 0.9}
    learner.analyze_failure("goal wrong", "target", actual)

    # "wrong" is in rivalry, not in target -> should be Down-weighted
    assert "wrong" in learner.updates
    assert learner.updates["wrong"] < 1.0

    # "objective" is in target, not in rival -> should be Up-weighted?
    # Wait, tokenize("goal wrong") gives ["goal", "wrong"]. "objective" is NOT in the query.
    # So updates["objective"] won't be set.

    # Test "objective" in query
    learner.analyze_failure("goal objective", "target", {"trigger": "rival", "score": 0.5})
    # "objective" is in query, in target, NOT in rival -> Up-weighted
    assert "objective" in learner.updates
    assert learner.updates["objective"] > 1.0

def test_meta_learner_report():
    mock_engine = mock.MagicMock()
    learner = MetaLearner(mock_engine)
    # Just ensure report doesn't crash with empty updates
    with mock.patch("src.tools.tune_weights.SovereignHUD.log") as mock_log:
        learner.report()
        mock_log.assert_called_with("PASS", "Optimization Matrix Balanced")
