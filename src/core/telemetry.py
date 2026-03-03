import json
import os
import time

import requests


class SubspaceTelemetry:
    """
    Subspace Telemetry Protocol.
    Allows Python Agents (O.D.I.N., A.L.F.R.E.D., Muninn) to "ping" PennyOne.
    This increases the file's Gravity (Live Heat) in the Autonomic Nervous System.
    """
    
    DEFAULT_PORT = 4000
    PING_ENDPOINT = "/api/telemetry/ping"
    TRACE_ENDPOINT = "/api/telemetry/trace"

    @staticmethod
    def flare(target_path: str, agent_id: str = "MUNINN", action: str = "SCAN") -> bool:
        """
        Sends a high-intensity pulse to PennyOne regarding a specific file.
        """
        payload = {
            "agent_id": agent_id,
            "action": action,
            "target_path": target_path,
            "timestamp": int(time.time() * 1000)
        }
        
        url = f"http://localhost:{SubspaceTelemetry.DEFAULT_PORT}{SubspaceTelemetry.PING_ENDPOINT}"
        
        try:
            # [A.L.F.R.E.D.] Ultra-short timeout for local telemetry (0.2s)
            response = requests.post(url, json=payload, timeout=0.2)
            return response.status_code == 200
        except Exception:
            return False

    @staticmethod
    def log_trace(mission_id: str, file_path: str, target_metric: str, initial_score: float, justification: str, status: str = "STARTED", final_score: float = 0.0) -> bool:
        """
        Records a detailed mission trace in the PennyOne Hall of Records.
        """
        payload = {
            "mission_id": mission_id,
            "file_path": file_path,
            "target_metric": target_metric,
            "initial_score": initial_score,
            "final_score": final_score,
            "justification": justification,
            "status": status,
            "timestamp": int(time.time() * 1000)
        }
        
        # [A.L.F.R.E.D.] Real-time Broadcast to Daemon (TUI Alert)
        if target_metric == "SECURITY" or status == "BREACH":
            SubspaceTelemetry.broadcast_alert_to_daemon(justification, file_path)

        url = f"http://localhost:{SubspaceTelemetry.DEFAULT_PORT}{SubspaceTelemetry.TRACE_ENDPOINT}"
        
        try:
            # [A.L.F.R.E.D.] Ultra-short timeout for local telemetry (0.5s)
            # [A.L.F.R.E.D.] Ultra-short timeout for local telemetry (0.2s)
            response = requests.post(url, json=payload, timeout=0.2)
            return response.status_code == 200
        except Exception:
            return False

    @staticmethod
    def broadcast_alert_to_daemon(message: str, file_path: str) -> None: # [Ω] Phase 2.1 Complete: Legacy bootstrap purged.
        """
        Connects to the Python Daemon and triggers a real-time security alert.
        """
        from pathlib import Path

        from websockets.sync.client import connect
        
        # [A.L.F.R.E.D.] Find project root and auth key
        root = Path(__file__).resolve().parent.parent.parent
        key_file = root / ".agent" / "daemon.key"
        
        if not key_file.exists():
            return

        try:
            auth_key = key_file.read_text().strip()
            port = int(os.getenv("CSTAR_DAEMON_PORT", "50051"))
            uri = f"ws://127.0.0.1:{port}"
            
            with connect(uri, timeout=1.0) as ws:
                # 1. Auth
                ws.send(json.dumps({"type": "auth", "auth_key": auth_key}))
                # 2. Alert Command
                ws.send(json.dumps({
                    "command": "security_alert",
                    "message": message,
                    "file": file_path
                }))
        except Exception:
            pass # We do not block for telemetry failures

# Lore: "A Raven's shadow leaves a mark on the Matrix."
