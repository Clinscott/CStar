
import sys
from pathlib import Path

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.personas import (
    AlfredStrategy,
    OdinStrategy,
    PersonaAuthorityBoundaryError,
    get_strategy,
)


class TestPersonasEmpire:

    def test_get_strategy_resolution(self):
        strategy = get_strategy("ODIN", ".")
        assert isinstance(strategy, OdinStrategy)

        strategy = get_strategy("ALFRED", ".")
        assert isinstance(strategy, AlfredStrategy)

        strategy = get_strategy("UNKNOWN", ".")
        assert isinstance(strategy, AlfredStrategy) # Default

    @pytest.mark.parametrize(
        ("method_name", "args"),
        [
            ("enforce_policy", ()),
            ("retheme_docs", ()),
            ("_quarantine", ("AGENTS.md",)),
            ("_sync_configs", ("ODIN",)),
            ("_create_cursor_rules", (".cursorrules",)),
            ("_create_standard_agents", ("AGENTS.md",)),
            ("_create_minimal_agents", ("AGENTS.md",)),
        ],
    )
    def test_legacy_authority_mutation_methods_fail_closed(self, tmp_path, method_name, args):
        strategy = OdinStrategy(tmp_path)

        with pytest.raises(PersonaAuthorityBoundaryError):
            getattr(strategy, method_name)(*args)

        assert list(tmp_path.iterdir()) == []

    def test_voices(self):
        odin = OdinStrategy(".")
        alfred = AlfredStrategy(".")

        assert odin.get_voice() == "odin"
        assert alfred.get_voice() == "alfred"

    def test_style_context_is_advisory_and_contains_no_policy_directive(self):
        context = OdinStrategy(".").get_style_context()

        assert context["persona"] == "ODIN"
        assert context["voice"] == "odin"
        assert context["domain_emphasis"]
        assert set(context) == {"persona", "voice", "tone", "domain_emphasis"}

if __name__ == "__main__":
    pytest.main([__file__])
