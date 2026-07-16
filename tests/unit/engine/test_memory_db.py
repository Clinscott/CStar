from pathlib import Path

import pytest

from src.core.engine.memory_db import (
    LEGACY_MEMORY_AUTHORITY_ERROR,
    MemoryDB,
)


def test_memory_db_is_detached_and_empty_by_default() -> None:
    db = MemoryDB("/synthetic/root")

    assert db.root == Path("/synthetic/root")
    assert db.detached is True
    assert db.simulated is True
    assert db.collection is None
    assert db.get_total_skills() == 0


def test_detached_index_partitions_records_without_mutating_input() -> None:
    db = MemoryDB("/synthetic/root")
    metadata = {"domain": "CORE"}

    db.upsert_skill("alpha", "start", "Start alpha service", metadata)
    db.upsert_skill("beta", "start", "Start beta service", {"domain": "CORE"})

    assert metadata == {"domain": "CORE"}
    assert [item["trigger"] for item in db.search_intent("alpha", "start")] == [
        "start"
    ]
    assert [item["description"] for item in db.search_intent("beta", "start")] == [
        "Start beta service"
    ]


def test_detached_batch_upsert_invalidates_search_cache() -> None:
    db = MemoryDB("/synthetic/root")

    assert db.search_intent("app", "repair") == []
    db.batch_upsert_skills(
        "app",
        [
            {
                "trigger": "repair",
                "description": "Repair a bounded contract",
                "metadata": {"domain": "DEV"},
            }
        ],
    )

    assert db.search_intent("app", "repair", domain="DEV")[0]["trigger"] == "repair"


def test_hall_escape_hatch_fails_closed() -> None:
    db = MemoryDB("/synthetic/root")

    with pytest.raises(
        RuntimeError,
        match=f"^{LEGACY_MEMORY_AUTHORITY_ERROR}$",
    ):
        db.get_hall_of_records()
