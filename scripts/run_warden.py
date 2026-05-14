"""
[CSTAR_KERNEL_MCP] Warden Driver

Deterministic, single-shot invoker for src/core/engine/wardens/*Warden classes.
Loaded by the cstar_warden MCP tool — emits JSON to stdout with the warden's
breach list. No LLM inference; AST/text scans only.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


WARDEN_REGISTRY: dict[str, tuple[str, str]] = {
    "norn": ("src.core.engine.wardens.norn", "NornWarden"),
    "valkyrie": ("src.core.engine.wardens.valkyrie", "ValkyrieWarden"),
    "freya": ("src.core.engine.wardens.freya", "FreyaWarden"),
    "mimir": ("src.core.engine.wardens.mimir", "MimirWarden"),
    "ghost": ("src.core.engine.wardens.ghost_warden", "GhostWarden"),
    "security": ("src.core.engine.wardens.security", "SecurityWarden"),
    "huginn": ("src.core.engine.wardens.huginn", "HuginnWarden"),
    "taste": ("src.core.engine.wardens.taste", "TasteWarden"),
    "edda": ("src.core.engine.wardens.edda", "EddaWarden"),
    "scour": ("src.core.engine.wardens.scour", "ScourWarden"),
    "runecaster": ("src.core.engine.wardens.runecaster", "RuneCasterWarden"),
    "shadow_forge": ("src.core.engine.wardens.shadow_forge", "ShadowForgeWarden"),
}


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a single Sentinel Warden and emit its breach list as JSON.")
    parser.add_argument("--warden", required=True, help="Warden slug (norn, valkyrie, freya, mimir, ghost, security, ...)")
    parser.add_argument("--target", default=None, help="Optional target path; informational, surfaced in the JSON envelope")
    parser.add_argument("--root", default=None, help="Project root (defaults to cwd)")
    args = parser.parse_args()

    slug = args.warden.strip().lower()
    if slug not in WARDEN_REGISTRY:
        emit({"error": f"unknown warden: {slug}", "available": sorted(WARDEN_REGISTRY)})
        return 2

    root = Path(args.root) if args.root else Path.cwd()
    if not root.exists() or not root.is_dir():
        emit({"error": f"root does not exist or is not a directory: {root}"})
        return 2

    module_path, class_name = WARDEN_REGISTRY[slug]
    try:
        module = __import__(module_path, fromlist=[class_name])
        warden_cls = getattr(module, class_name)
    except (ImportError, AttributeError) as exc:
        emit({"error": f"failed to import {module_path}.{class_name}: {exc}"})
        return 3

    try:
        warden = warden_cls(root)
        breaches = warden.scan()
    except Exception as exc:  # noqa: BLE001 — surface arbitrary scan failures to the host
        emit({"error": f"warden scan failed: {exc}", "warden": slug})
        return 4

    serialisable: list[dict[str, Any]] = []
    for entry in breaches or []:
        if isinstance(entry, dict):
            serialisable.append({k: v for k, v in entry.items() if _json_safe(v)})

    emit({
        "warden": slug,
        "target": args.target,
        "root_used": str(root),
        "count": len(serialisable),
        "breaches": serialisable,
    })
    return 0


def _json_safe(value: Any) -> bool:
    try:
        json.dumps(value)
        return True
    except (TypeError, ValueError):
        return False


if __name__ == "__main__":
    sys.exit(main())
