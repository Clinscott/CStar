"""
[Ω] Synapse DB repair helpers for Python runtimes.
Purpose: Recover from malformed local Synapse stores without collapsing the caller.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, UTC
from pathlib import Path


def _is_recoverable_sqlite_error(error: BaseException) -> bool:
    message = str(error).lower()
    return (
        "database disk image is malformed" in message
        or "file is not a database" in message
        or "malformed" in message
        or "quick_check failed" in message
        or "integrity_check failed" in message
        or "btreeinitpage" in message
        or "invalid page number" in message
        or "freelist" in message
    )


def _initialize_synapse_schema(db_path: Path) -> None:
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS synapse (
                id INTEGER PRIMARY KEY,
                prompt TEXT,
                response TEXT,
                status TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def _validate_synapse_db(db_path: Path) -> None:
    with sqlite3.connect(str(db_path)) as conn:
        quick_check = conn.execute("PRAGMA quick_check").fetchone()
        if quick_check and str(quick_check[0]).lower() != "ok":
            raise sqlite3.DatabaseError(f"Synapse quick_check failed: {quick_check[0]}")
        conn.execute("SELECT COUNT(*) FROM synapse").fetchone()


def ensure_healthy_synapse_db(db_path: Path) -> tuple[bool, Path | None]:
    db_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        _initialize_synapse_schema(db_path)
        _validate_synapse_db(db_path)
        return False, None
    except sqlite3.DatabaseError as exc:
        if not _is_recoverable_sqlite_error(exc):
            raise

        stamp = datetime.now(UTC).isoformat().replace(":", "-").replace(".", "-")
        backup_path = db_path.with_name(f"{db_path.name}.corrupt-{stamp}.bak")
        if db_path.exists():
            os.replace(db_path, backup_path)

        _initialize_synapse_schema(db_path)
        _validate_synapse_db(db_path)
        return True, backup_path
