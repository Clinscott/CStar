import unittest.mock as mock

from src.tools.trace_viz import TraceRenderer


def test_trace_renderer_isolation():
    # Target the SovereignHUD instance used by the module
    from src.tools.trace_viz import SovereignHUD
    SovereignHUD._INITIALIZED = True # Prevent loading from config
    SovereignHUD.PERSONA = "ALFRED" # Set base

    # We want to ensure TraceRenderer(ALFRED) uses Cyan
    # and TraceRenderer(ODIN) uses Red, regardless of current SovereignHUD.PERSONA

    renderer_a = TraceRenderer("ALFRED")
    assert renderer_a.theme["main"] == SovereignHUD.CYAN

    renderer_o = TraceRenderer("ODIN")
    assert renderer_o.theme["main"] == SovereignHUD.RED

    # Check that it restores correctly
    SovereignHUD.PERSONA = "ALFRED"
    renderer_o = TraceRenderer("ODIN")
    assert SovereignHUD.PERSONA == "ALFRED" # Restored after init

def test_trace_renderer_causal_chain():
    renderer = TraceRenderer("ALFRED")
    traces = [
        {"trigger": "/lets-go"},
        {"trigger": "/run-task"},
        {"trigger": "/run-task"} # duplicate
    ]

    with mock.patch("src.tools.trace_viz.SovereignHUD.box_row") as mock_row:
        renderer.render_neural_path(traces)
        # Should have called box_row for STEP 01 and STEP 02
        assert mock_row.call_count == 2
        assert mock_row.call_args_list[0][0][1] == "/lets-go"
        assert mock_row.call_args_list[1][0][1] == "/run-task"
