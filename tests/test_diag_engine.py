from src.tools.debug.diag_engine import run_diag


def test_run_diag_logic(monkeypatch):
    """Verifies that the diagnostic engine runs correctly."""
    class MockEngine:
        def __init__(self, **kwargs):
            self.thesaurus = {"updates": {"patch", "fix"}}
        def load_core_skills(self): pass
        def load_skills_from_dir(self, d, prefix=""): pass
        def build_index(self): pass
        def search(self, query):
            return [{"trigger": "skill_update", "score": 0.99}]

    monkeypatch.setattr("src.tools.debug.diag_engine.SovereignVector", MockEngine)

    # run_diag should print and not crash
    run_diag()
