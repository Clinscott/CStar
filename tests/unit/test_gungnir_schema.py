import json

import pytest

from src.core.engine.gungnir.schema import build_gungnir_matrix, get_gungnir_overall, matrix_to_dict
from src.core.engine.gungnir.universal import UniversalGungnir


def test_gungnir_schema_serializes_canonical_fields() -> None:
    matrix = build_gungnir_matrix(
        {
            "logic": 8.25,
            "style": 7.5,
            "intel": 9.0,
            "gravity": 4.0,
            "vigil": 10.0,
            "evolution": 8.5,
            "anomaly": 0.5,
            "sovereignty": 8.75,
            "overall": 8.1,
            "stability": 6.75,
            "coupling": 2.5,
            "aesthetic": 8.25,
        }
    )

    payload = matrix_to_dict(matrix)

    assert payload == {
        "version": "1.0",
        "logic": 8.25,
        "style": 7.5,
        "intel": 9.0,
        "gravity": 4.0,
        "vigil": 10.0,
        "evolution": 8.5,
        "anomaly": 0.5,
        "sovereignty": 8.75,
        "overall": 8.1,
        "stability": 6.75,
        "coupling": 2.5,
        "aesthetic": 8.25,
    }
    assert get_gungnir_overall(payload) == 8.1


def test_gungnir_schema_warns_on_invalid_supplied_metric(caplog) -> None:
    caplog.set_level("WARNING", logger="src.core.engine.gungnir.schema")

    matrix = build_gungnir_matrix({"logic": "corrupt", "style": 6, "intel": 6})

    assert matrix.logic == 0.0
    assert matrix.style == 6.0
    assert any("Invalid Gungnir metric for logic" in record.message for record in caplog.records)


def test_gungnir_schema_warns_on_non_finite_metric(caplog) -> None:
    caplog.set_level("WARNING", logger="src.core.engine.gungnir.schema")

    matrix = build_gungnir_matrix({"overall": float("nan"), "logic": 6, "style": 6, "intel": 6})

    assert matrix.overall == 3.6
    assert any("Non-finite Gungnir metric for overall" in record.message for record in caplog.records)


def test_gungnir_schema_rounds_derived_metrics_for_stable_comparisons() -> None:
    matrix = build_gungnir_matrix(
        {
            "logic": 8.5,
            "style": 9.5,
            "intel": 8.5,
            "vigil": 10.0,
            "evolution": 9.125,
            "sovereignty": 8.90625,
        }
    )

    assert matrix.overall == 9.0885
    assert matrix.aesthetic == 8.8333


def test_gungnir_schema_preserves_an_explicit_zero_overall() -> None:
    matrix = build_gungnir_matrix(
        {
            "logic": 10.0,
            "style": 10.0,
            "intel": 10.0,
            "vigil": 10.0,
            "evolution": 10.0,
            "sovereignty": 10.0,
            "overall": 0.0,
        }
    )

    assert matrix.overall == 0.0


def test_universal_gungnir_emits_canonical_matrix_projection() -> None:
    matrix = UniversalGungnir().score_matrix("def alpha():\n    return 1\n", ".py")

    serialized = json.dumps(matrix)

    assert matrix["version"] == "1.0"
    assert "logic" in matrix
    assert "evolution" in matrix
    assert "overall" in matrix
    assert matrix["overall"] == 10.0
    assert matrix["stability"] == 10.0
    assert matrix["aesthetic"] == 10.0
    assert '"version": "1.0"' in serialized


def test_universal_gungnir_score_decreases_for_a_critical_parse_breach() -> None:
    gungnir = UniversalGungnir()

    clean = gungnir.score_matrix("def alpha():\n    return 1\n", ".py")
    malformed = gungnir.score_matrix("def alpha(:\n    return 1\n", ".py")

    assert 0.0 <= malformed["overall"] < clean["overall"] <= 10.0
    assert malformed["anomaly"] == 1.0


def test_universal_gungnir_rejects_unsupported_files_instead_of_scoring_them_perfectly() -> None:
    gungnir = UniversalGungnir()

    with pytest.raises(ValueError, match="Unsupported Gungnir file extension"):
        gungnir.audit("opaque content", ".bin")

    with pytest.raises(ValueError, match="Unsupported Gungnir file extension"):
        gungnir.score_matrix("opaque content", ".bin")
