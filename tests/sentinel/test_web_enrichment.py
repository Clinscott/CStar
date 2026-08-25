from pathlib import Path

from src.core.engine.utils.code_sanitizer import BifrostGate


def test_live_import_enrichment_is_retired_for_valid_code():
    gate = BifrostGate(Path("/synthetic"))
    assert gate.scan_and_enrich_imports("import os\nimport sys") == ""


def test_live_import_enrichment_is_retired_for_unknown_module():
    gate = BifrostGate(Path("/synthetic"))
    assert gate.scan_and_enrich_imports("import fakelib_xyz") == ""


def test_unknown_import_remains_visible_to_pure_validator():
    gate = BifrostGate(Path("/synthetic"))
    findings = gate.validate_imports("import fakelib_xyz")
    assert findings and "fakelib_xyz" in findings[0]
