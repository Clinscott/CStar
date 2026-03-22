"""
[SPOKE] Taliesin Forge (The Living Lore Compiler)
Lore: "When the Bard sings, the world shifts to match the melody."
Purpose: Materialize validation-ready forge candidates from canonical bead-backed requests.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[2]
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.engine.forge_candidate import (
    ForgeCandidateRequest,
    ForgeCandidateResult,
    build_forge_request_from_bead,
    extract_candidate_payload,
    stage_forge_candidate,
)
from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink
from docs.legacy_archive.src_sentinel.taliesin import TaliesinSpoke

MARKER = "__CORVUS_TALIESIN__"


class TaliesinForge:
    """
    [Omega] The Forge of the Bard.
    Canonical authority for bead-backed code candidate generation.
    """

    def __init__(self, root_path: Path):
        self.root = root_path
        self.uplink = AntigravityUplink()
        self.taliesin = TaliesinSpoke(root_path)

    async def forge_candidate(self, request: ForgeCandidateRequest) -> ForgeCandidateResult | None:
        """Forge a validation-ready candidate from a canonical request envelope."""
        SovereignHUD.log("INFO", f"Taliesin Forge igniting for bead {request.bead_id}: {request.target_path}")
        candidate_brief = await self.taliesin.build_candidate_brief(request)

        prompt = (
            "ACT AS: The Taliesin Forge Architect.\n"
            "MANDATE: Produce a validation-ready candidate from the canonical forge request.\n\n"
            f"FORGE REQUEST:\n```json\n{json.dumps(request.to_dict(), indent=2)}\n```\n\n"
            f"FORGE BRIEF:\n{candidate_brief}\n\n"
            "CONSTRAINTS:\n"
            "1. Output MUST be a valid JSON object.\n"
            "2. Fields: 'target_path', 'code', 'summary', and optional 'required_validations'.\n"
            "3. Respect the target path, bead id, baseline scores, and contract refs.\n"
            "4. Generate code only for the requested target.\n"
            "5. Do not emit markdown or explanation outside the JSON payload.\n"
        )

        response = await self.uplink.send_payload(
            prompt,
            {
                "persona": request.operator_constraints.get("persona", "TALIESIN"),
                "model": request.operator_constraints.get("model", "gemini-3-flash-preview"),
                "system_prompt": request.operator_constraints.get("system_prompt", "Output ONLY valid JSON."),
            },
        )

        if response.get("status") != "success":
            SovereignHUD.log("FAIL", f"The Forge was extinguished: {response.get('message')}")
            return None

        raw_output = response.get("data", {}).get("raw", "")
        try:
            payload = extract_candidate_payload(raw_output)
            result = stage_forge_candidate(self.root, request, payload)
            SovereignHUD.log("SUCCESS", f"Candidate forged for {result.target_path}")
            return result
        except Exception as exc:
            SovereignHUD.log("ERROR", f"Forge materialization failed: {exc}")
            return None

    async def weave_code_from_lore(self, lore_file_path: Path) -> bool:
        """
        Compatibility-only lore adapter.
        Runtime forge no longer mints work units from lore during live execution.
        """
        if not lore_file_path.exists():
            SovereignHUD.log("FAIL", f"Lore file not found: {lore_file_path}")
            return False

        SovereignHUD.log(
            "FAIL",
            "Legacy lore-file forge is no longer canonical. Create a bead and invoke TALIESIN with --bead-id.",
        )
        return False

    async def forge_candidate_from_bead(
        self,
        bead_id: str,
        *,
        operator_constraints: dict[str, Any] | None = None,
    ) -> ForgeCandidateResult | None:
        """Convenience entrypoint for direct bead-driven TALIESIN execution."""
        request = build_forge_request_from_bead(
            self.root,
            bead_id,
            operator_constraints=operator_constraints
            or {"persona": "TALIESIN", "model": "gemini-3-flash-preview"},
        )
        return await self.forge_candidate(request)


def _emit_cli_payload(payload: dict[str, Any]) -> None:
    print(f"{MARKER}{json.dumps(payload, ensure_ascii=True)}")


async def _run_cli(args: argparse.Namespace) -> int:
    if args.lore_file:
        _emit_cli_payload(
            {
                "status": "FAILURE",
                "summary": "Legacy lore-file forge is no longer canonical. Create a bead and invoke TALIESIN with --bead-id.",
                "error": "Compatibility-only lore adapter rejected for canonical runtime execution.",
                "compatibility_mode": "lore_adapter",
                "lore_file": str(Path(args.lore_file)),
            }
        )
        return 1

    forge = TaliesinForge(project_root)
    try:
        result = await forge.forge_candidate_from_bead(
            args.bead_id,
            operator_constraints={
                "persona": args.persona,
                "model": args.model,
            },
        )
    except Exception as exc:
        _emit_cli_payload(
            {
                "status": "FAILURE",
                "summary": str(exc),
                "error": str(exc),
                "bead_id": args.bead_id,
            }
        )
        return 1

    if result is None:
        _emit_cli_payload(
            {
                "status": "FAILURE",
                "summary": f"TALIESIN forge did not materialize a candidate for bead {args.bead_id}.",
                "error": "Forge materialization returned no candidate.",
                "bead_id": args.bead_id,
            }
        )
        return 1

    _emit_cli_payload(
        {
            "status": "SUCCESS",
            "summary": f"Candidate forged for {result.target_path}",
            "bead_id": result.bead_id,
            "target_path": result.target_path,
            "candidate": result.to_dict(),
            "validation_request": result.validation_request.to_dict()
            if result.validation_request is not None
            else None,
        }
    )
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="TALIESIN forge runtime entrypoint"
    )
    parser.add_argument("--bead-id", help="Canonical bead id to forge from.")
    parser.add_argument(
        "--persona",
        default="TALIESIN",
        help="Persona override for the forge request.",
    )
    parser.add_argument(
        "--model",
        default="gemini-3-flash-preview",
        help="Model override for the forge request.",
    )
    parser.add_argument(
        "--lore-file",
        help="Compatibility-only lore adapter path. Canonical runtime forge rejects this mode.",
    )
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    if not args.bead_id and not args.lore_file:
        parser.error("TALIESIN forge requires --bead-id.")
    raise SystemExit(asyncio.run(_run_cli(args)))


if __name__ == "__main__":
    main()
