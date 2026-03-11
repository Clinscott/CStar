from __future__ import annotations

import asyncio
import json
import shutil
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

MARKER = "__CORVUS_KERNEL__"


def _success(data: Any | None = None, **extra: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {"status": "success", "data": data}
    payload.update(extra)
    return payload


def _error(message: str, *, data: Any | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"status": "error", "error": message}
    if data is not None:
        payload["data"] = data
    return payload


def _resolve_runtime_root(payload: dict[str, Any]) -> Path:
    candidate = payload.get("cwd") or payload.get("project_root")
    if not candidate:
        return PROJECT_ROOT
    return Path(str(candidate)).resolve()


def _path_within_root(root: Path, candidate: Path) -> bool:
    resolved_root = root.resolve()
    resolved_candidate = candidate.resolve()
    return resolved_candidate == resolved_root or resolved_root in resolved_candidate.parents


async def _route_intent(root: Path, payload: dict[str, Any], args: list[Any]) -> dict[str, Any]:
    from src.core.engine.cognitive_router import CognitiveRouter

    if payload.get("command") == "ask":
        prompt = str(args[0] if args else payload.get("query") or "")
        target_file = str(args[1] if len(args) > 1 else "")
        loki_mode = len(args) > 2 and str(args[2]).upper() == "LOKI_MODE"
    else:
        intent_payload = args[0] if args and isinstance(args[0], dict) else {}
        system_meta = intent_payload.get("system_meta") or {}
        entities = intent_payload.get("extracted_entities") or {}
        prompt = str(
            intent_payload.get("intent_raw")
            or intent_payload.get("intent_normalized")
            or payload.get("query")
            or ""
        )
        target_file = str(entities.get("target_file") or system_meta.get("target_file") or "")
        loki_mode = bool(system_meta.get("loki_mode"))

    result = await CognitiveRouter(root).route_intent(prompt, target_file, loki_mode=loki_mode)
    if result.get("status") == "success":
        return _success(result)
    return _error(str(result.get("message") or "Intent routing failed."), data=result)


async def _norn_poll(root: Path) -> dict[str, Any]:
    from src.core.engine.cognitive_router import CognitiveRouter
    from src.core.norn_coordinator import NornCoordinator

    coordinator = NornCoordinator(root)
    coordinator.sync_tasks()

    router = CognitiveRouter(root)
    bead = coordinator.get_next_bead(router.agent_id)
    if not bead:
        return _success({"message": "No tasks available."})

    target_file = str(bead.get("target_path") or bead.get("file") or "")
    result = await router.route_intent(str(bead.get("description") or bead.get("rationale") or ""), target_file, loki_mode=True)
    if result.get("status") == "success":
        coordinator.complete_bead_work(
            bead["id"],
            resolution_note="Autonomous route completed; awaiting validation.",
        )
        return _success(result)

    coordinator.block_bead(
        bead["id"],
        "Autonomous route failed during kernel sweep.",
        resolution_note=str(result.get("message") or "Intent routing failed."),
    )
    return _error(str(result.get("message") or "No tasks were completed."), data=result)


def _physical_move(root: Path, args: list[Any]) -> dict[str, Any]:
    if len(args) < 2:
        return _error("PHYSICAL_MOVE_REQUEST requires source and target paths.")

    source_path = Path(root, str(args[0])).resolve()
    target_path = Path(root, str(args[1])).resolve()
    if not _path_within_root(root, source_path) or not _path_within_root(root, target_path):
        return _success({"status": "MOVE_FAIL", "message": "Path Traversal Blocked."})

    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source_path), str(target_path))
        return _success({"status": "MOVE_SUCCESS", "message": "File moved successfully."})
    except (PermissionError, FileNotFoundError, OSError) as error:
        return _success({"status": "MOVE_FAIL", "message": str(error)})


def _fatal_rollback(root: Path, args: list[Any]) -> dict[str, Any]:
    if len(args) < 2:
        return _error("FATAL_ROLLBACK requires original and target paths.")

    source_path = Path(root, str(args[0])).resolve()
    target_path = Path(root, str(args[1])).resolve()
    if not _path_within_root(root, source_path) or not _path_within_root(root, target_path):
        return _success({"status": "ROLLBACK_SKIPPED"})

    if target_path.exists():
        shutil.move(str(target_path), str(source_path))
    return _success({"status": "ROLLBACK_COMPLETE"})


def _ghost_pulse(root: Path, args: list[Any]) -> dict[str, Any]:
    if len(args) < 2:
        return _error("GHOST_PULSE requires a file path and content.")

    from src.sentinel.wardens.ghost_warden import GhostWarden

    result = GhostWarden(root).adjudicate(str(args[0]), str(args[1]))
    return _success(result)


def _verify(root: Path, args: list[Any]) -> dict[str, Any]:
    if not args:
        return _error("verify requires a candidate path.")

    from src.cstar.core.uplink import AntigravityUplink
    from src.sentinel.muninn_crucible import MuninnCrucible

    test_path = Path(str(args[0]))
    if not test_path.is_absolute():
        test_path = (root / test_path).resolve()
    success = MuninnCrucible(root, AntigravityUplink()).verify_fix(test_path)
    return _success(
        {
            "message": "Crucible verified" if success else "Crucible failed",
            "status": "success" if success else "error",
        }
    )


async def _dispatch(payload: dict[str, Any]) -> dict[str, Any]:
    command = str(payload.get("command") or "").strip()
    args = payload.get("args")
    if not isinstance(args, list):
        args = [args] if args is not None else []
    root = _resolve_runtime_root(payload)

    if command == "ping":
        return _success({"message": "kernel bridge ready", "root": str(root)})
    if command == "shutdown":
        return _success({"message": "No resident daemon is running in kernel mode."})
    if command == "MATRIX_UPDATED":
        return _success({"status": "NOOP", "message": "Matrix update broadcast is on-demand in kernel mode."})
    if command == "HEIMDALL_ALERT":
        return _success({"status": "NOOP", "message": "Heimdall alert recorded without a resident daemon."})
    if command == "PHYSICAL_MOVE_REQUEST":
        return _physical_move(root, args)
    if command == "FATAL_ROLLBACK":
        return _fatal_rollback(root, args)
    if command == "GHOST_PULSE":
        return _ghost_pulse(root, args)
    if command == "verify":
        return _verify(root, args)
    if command == "ask" or command == "ROUTE_INTENT":
        return await _route_intent(root, payload, args)
    if command == "NORN_POLL":
        return await _norn_poll(root)

    return _error(f"Unknown kernel bridge command: {command}")


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        result = asyncio.run(_dispatch(payload))
    except Exception as error:
        result = _error(str(error))
    print(f"{MARKER}{json.dumps(result, ensure_ascii=True)}")


if __name__ == "__main__":
    main()
