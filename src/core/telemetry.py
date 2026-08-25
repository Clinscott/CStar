"""Retired Python HTTP telemetry compatibility surface.

Telemetry summaries and result recording belong to CStar kernel tools.  The
legacy helper no longer opens a socket, broadcasts to a daemon, or writes a
noncanonical trace.  Boolean returns remain stable for old optional callers.
"""

from __future__ import annotations


RETIRED_ERROR = "legacy_python_http_telemetry_retired_use_cstar_kernel_telemetry"


class SubspaceTelemetry:
    """No-effect compatibility API for callers that treated telemetry as optional."""

    DEFAULT_PORT = 4000
    PING_ENDPOINT = "/api/telemetry/ping"
    TRACE_ENDPOINT = "/api/telemetry/trace"

    @staticmethod
    def flare(target_path: str, agent_id: str = "MUNINN", action: str = "SCAN") -> bool:
        return False

    @staticmethod
    def log_trace(
        mission_id: str,
        file_path: str,
        target_metric: str,
        initial_score: float,
        justification: str,
        status: str = "STARTED",
        final_score: float = 0.0,
    ) -> bool:
        return False

    @staticmethod
    def broadcast_alert_to_daemon(message: str, file_path: str) -> None:
        return None
