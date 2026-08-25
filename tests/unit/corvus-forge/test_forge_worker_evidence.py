from __future__ import annotations

import json
import errno
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / ".agents" / "skills" / "corvus-forge" / "scripts"
sys.path.insert(0, str(SCRIPTS))

from forge_worker_evidence import (  # noqa: E402
    bounded_delegate_failure, bounded_process_failure, bounded_success_evidence,
)


ROLES = ("specifier", "coder", "cleaner", "architect", "hardener", "qa")


def role_receipt(index: int) -> dict[str, object]:
    return {
        "role": ROLES[index], "phase": f"{index + 1}/6",
        "input_handoff_sha256": "0" * 64,
        "specification_handoff_sha256": "0" * 64,
        "output_handoff_sha256": f"{index + 1:x}" * 64,
        "input_tokens": 10, "output_tokens": 20,
    }


def provider_receipt(index: int, complete: bool = True) -> dict[str, object]:
    return {
        "role": ROLES[index], "phase": f"{index + 1}/6",
        "final_state": "response_body_complete" if complete else "dispatch_attempted",
        "binding_sha256": f"{index + 1:x}" * 64,
        "journal_sha256": f"{index + 2:x}" * 64,
        "journal_valid": True, "synthetic": False,
    }


class WorkerEvidenceTest(unittest.TestCase):
    def test_launch_failure_is_no_spend_but_uncertain_child_failure_is_unknown(self) -> None:
        launch = bounded_process_failure(OSError(errno.ENOENT, "secret-path-canary"))
        self.assertIs(launch["live_spend"], False)
        self.assertIs(launch["live_spend_unknown"], False)
        self.assertNotIn("secret-path-canary", str(launch))

        uncertain = bounded_process_failure(TimeoutError("secret-timeout-canary"))
        self.assertIsNone(uncertain["live_spend"])
        self.assertIs(uncertain["live_spend_unknown"], True)
        self.assertNotIn("secret-timeout-canary", str(uncertain))

    def test_known_spend_cannot_mask_later_ambiguity(self) -> None:
        raw = {
            "status": "degraded", "degraded_reason": "forge_entrypoint_provider_request_failed",
            "forge_topology": "bounded-six-role-manifest-v1", "role_plan_sha256": "a" * 64,
            "role_receipts": [role_receipt(index) for index in range(3)],
            "provider_request_receipts": [
                *(provider_receipt(index) for index in range(3)),
                provider_receipt(3, complete=False),
            ],
            "provider_requests_started": 4, "provider_requests_completed": 3,
            "provider_requests_ambiguous": 1, "input_tokens": 30, "output_tokens": 60,
            "live_spend": None, "live_spend_unknown": True,
            "known_spend_observed": True, "live_source_collection": False,
        }
        bounded = bounded_delegate_failure(raw, "forge_hermes_delegate_failed")
        self.assertIsNone(bounded["live_spend"])
        self.assertTrue(bounded["live_spend_unknown"])
        self.assertTrue(bounded["known_spend_observed"])
        self.assertEqual(bounded["provider_requests_completed"], 3)
        self.assertEqual(len(bounded["role_receipts"]), 3)

    def test_complete_six_role_evidence_is_known_spend(self) -> None:
        raw = {
            "forge_topology": "bounded-six-role-manifest-v1", "role_plan_sha256": "a" * 64,
            "role_receipts": [role_receipt(index) for index in range(6)],
            "provider_request_receipts": [provider_receipt(index) for index in range(6)],
            "provider_requests_started": 6, "provider_requests_completed": 6,
            "provider_requests_ambiguous": 0, "input_tokens": 60, "output_tokens": 120,
            "live_spend": True, "live_spend_unknown": False, "known_spend_observed": True,
        }
        bounded = bounded_success_evidence(raw)
        self.assertEqual(bounded["live_spend"], True)
        self.assertEqual(bounded["live_spend_unknown"], False)

    def test_malformed_receipts_fail_closed_without_echoing_values(self) -> None:
        canary = "secret-bearing-provider-output"
        raw = {
            "degraded_reason": canary, "provider_request_receipts": [{"raw": canary}],
            "role_receipts": [], "provider_requests_started": 1,
            "provider_requests_completed": 0, "provider_requests_ambiguous": 0,
            "input_tokens": 0, "output_tokens": 0, "live_spend": False,
            "live_spend_unknown": False,
        }
        bounded = bounded_delegate_failure(raw, "forge_hermes_delegate_failed")
        serialized = json.dumps(bounded, sort_keys=True)
        self.assertNotIn(canary, serialized)
        self.assertIsNone(bounded["live_spend"])
        self.assertTrue(bounded["live_spend_unknown"])


if __name__ == "__main__":
    unittest.main()
