import unittest.mock as mock

from src.tools.update_gemini_manifest import ManifestOrchestrator, update_manifest


def test_update_manifest_simple():
    # Direct mock of the logic dependencies
    with mock.patch.object(
        ManifestOrchestrator,
        "_resolve_root",
        return_value=mock.Mock(
            __truediv__=lambda self, other: mock.Mock(),
            __str__=lambda self: "C:/mock-root",
        ),
    ):
        with mock.patch.object(ManifestOrchestrator, "_get_priority_directives", return_value="Queue OK"):
            with mock.patch.object(ManifestOrchestrator, "_get_git_summary", return_value="Git OK"):
                with mock.patch("pathlib.Path.exists", return_value=True):
                    m = mock.mock_open(read_data='{"persona": "ODIN"}')
                    with mock.patch("pathlib.Path.open", m):
                        with mock.patch("json.load", return_value={"persona": "ODIN"}):
                            update_manifest()

                        handle = m()
                        written = "".join(call[0][0] for call in handle.write.call_args_list)
                        assert "**Active Mind**: ODIN" in written
                        assert "Queue OK" in written
