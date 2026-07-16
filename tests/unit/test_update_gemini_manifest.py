from contextlib import ExitStack
from unittest.mock import patch

import pytest

from src.tools.update_gemini_manifest import ManifestOrchestrator, update_manifest


ERROR = "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"


@pytest.mark.parametrize(
    "invoke",
    [
        update_manifest,
        ManifestOrchestrator,
        ManifestOrchestrator._get_git_summary,
        ManifestOrchestrator._resolve_root,
        lambda: ManifestOrchestrator._get_priority_directives("synthetic"),
        ManifestOrchestrator.execute,
    ],
)
def test_manifest_actions_fail_before_git_hall_or_filesystem(invoke) -> None:
    with ExitStack() as stack:
        probes = [
            stack.enter_context(patch(target))
            for target in (
                "builtins.open",
                "pathlib.Path.exists",
                "pathlib.Path.write_text",
                "subprocess.run",
                "sqlite3.connect",
            )
        ]
        with pytest.raises(RuntimeError, match=f"^{ERROR}$"):
            invoke()

    for probe in probes:
        probe.assert_not_called()
