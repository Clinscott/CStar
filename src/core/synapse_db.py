"""Retired Python Synapse database writer tombstone."""

from pathlib import Path


RETIRED_SYNAPSE_DB_ERROR = (
    "legacy_synapse_db_writer_retired_use_cstar_kernel"
)


def ensure_healthy_synapse_db(db_path: Path) -> tuple[bool, Path | None]:
    del db_path
    raise RuntimeError(RETIRED_SYNAPSE_DB_ERROR)
