"""Retirement contracts for the legacy network trace-ingestion pipeline."""

from contextlib import ExitStack
from unittest.mock import patch

import pytest

from src.tools.network_watcher import CruciblePipeline, NetworkWatcher


ERROR = "legacy_network_watcher_retired_use_cstar_kernel_receipts"


@pytest.mark.parametrize(
    "invoke",
    [
        lambda: CruciblePipeline("synthetic-root", "synthetic-base").process(
            "synthetic-trace.json"
        ),
        lambda: NetworkWatcher(
            "synthetic-share",
            CruciblePipeline("synthetic-root", "synthetic-base"),
        ).watch(),
    ],
)
def test_network_pipeline_fails_before_process_or_filesystem_effects(invoke):
    with ExitStack() as stack:
        probes = [
            stack.enter_context(patch(target))
            for target in (
                "builtins.open",
                "pathlib.Path.mkdir",
                "pathlib.Path.read_text",
                "pathlib.Path.write_text",
                "shutil.copy2",
                "shutil.move",
                "subprocess.run",
            )
        ]
        with pytest.raises(RuntimeError, match=f"^{ERROR}$"):
            invoke()

    for probe in probes:
        probe.assert_not_called()
