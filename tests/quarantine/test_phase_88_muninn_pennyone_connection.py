"""Regression proof for retired Python-to-PennyOne HTTP telemetry."""

from src.core.telemetry import SubspaceTelemetry


def test_subspace_telemetry_is_stable_no_effect():
    assert SubspaceTelemetry.flare("synthetic.py") is False
    assert (
        SubspaceTelemetry.log_trace(
            mission_id="synthetic",
            file_path="synthetic.py",
            target_metric="LOGIC",
            initial_score=0.0,
            justification="synthetic fixture",
        )
        is False
    )
    assert SubspaceTelemetry.broadcast_alert_to_daemon("message", "synthetic.py") is None
