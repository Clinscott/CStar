from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = ROOT / ".agents" / "skills" / "corvus-forge" / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))
SPEC = importlib.util.spec_from_file_location(
    "forge_worker_adapter_rejected_manifest_test",
    SCRIPT_DIR / "forge_worker_adapter.py",
)
assert SPEC and SPEC.loader
ADAPTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ADAPTER)


def intent() -> dict[str, object]:
    return {
        "expected_callback_packet": "SAFE_CALLBACK",
        "required_output_paths": ["one.py", "two.py"],
    }


def test_rejected_evidence_contains_only_hash_and_shape_metadata() -> None:
    canary = "NEVER_PERSIST_THIS_MODEL_VALUE"
    manifest = {
        "summary": canary,
        "files": [{"path": f"{canary}.py", "content": canary}],
        "callback_packet": canary,
        "unknown_secret_name": canary,
    }

    response = ADAPTER.build_rejected_manifest_response(
        manifest,
        "status_missing",
        intent(),
        {},
    )
    serialized = json.dumps(response, sort_keys=True)

    assert canary not in serialized
    evidence = response["artifacts"]["rejected_manifest"]
    assert evidence["failure_class"] == "status_missing"
    assert evidence["raw_manifest_persisted"] is False
    assert evidence["raw_values_emitted"] is False
    assert evidence["unknown_field_count"] == 1
    assert evidence["files"]["count"] == 1
    assert evidence["callback_packet"]["matches_expected"] is False
    assert re.fullmatch(r"[a-f0-9]{64}", evidence["sha256"])
    assert response["files_changed"] == []
    assert response["callback_packet"] == "SAFE_CALLBACK"


@pytest.mark.parametrize(
    ("manifest", "code"),
    [
        ({"files": []}, "status_missing"),
        ({"status": "failure", "files": []}, "status_non_success"),
        ({"status": "success", "files_changed": []}, "files_changed_legacy"),
        ({"status": "success", "files": {}}, "files_not_array"),
        ({"status": "success", "files": []}, "files_empty"),
        ({"status": "success", "files": [{"path": "", "content": "x"}]}, "file_path_invalid"),
        ({"status": "success", "files": [{"path": "x", "content": 1}]}, "file_content_invalid"),
    ],
)
def test_manifest_failures_have_stable_non_secret_codes(
    manifest: dict[str, object],
    code: str,
) -> None:
    with pytest.raises(ADAPTER.ManifestContractError) as raised:
        ADAPTER.normalize_file_entries(manifest)
    assert raised.value.code == code
    assert str(raised.value) == code


def test_callback_failures_do_not_echo_expected_or_actual_values() -> None:
    with pytest.raises(ADAPTER.ManifestContractError) as missing:
        ADAPTER.validate_callback_packet({}, "EXPECTED_CANARY")
    assert missing.value.code == "callback_missing"
    assert "EXPECTED_CANARY" not in str(missing.value)

    with pytest.raises(ADAPTER.ManifestContractError) as mismatch:
        ADAPTER.validate_callback_packet(
            {"callback_packet": "ACTUAL_CANARY"},
            "EXPECTED_CANARY",
        )
    assert mismatch.value.code == "callback_mismatch"
    assert "ACTUAL_CANARY" not in str(mismatch.value)
    assert "EXPECTED_CANARY" not in str(mismatch.value)


@pytest.mark.parametrize(
    ("message", "code"),
    [
        ("model manifest contains duplicate file path: canary", "duplicate_file_path"),
        ("model manifest missing required output paths: canary", "missing_required_output"),
        ("model manifest contains outputs outside required_output_paths: canary", "undeclared_output"),
        ("write path contains symlink: canary", "unsafe_symlink_path"),
        ("unexpected canary detail", "worker_application_failure"),
    ],
)
def test_application_failures_are_classified_without_returning_details(
    message: str,
    code: str,
) -> None:
    classified = ADAPTER.classify_manifest_failure(ValueError(message))
    assert classified == code
    assert "canary" not in classified
