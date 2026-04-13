import json

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


def test_universal_gungnir_emits_canonical_matrix_projection() -> None:
    matrix = UniversalGungnir().score_matrix("def alpha():\n    return 1\n", ".py")

    serialized = json.dumps(matrix)

    assert matrix["version"] == "1.0"
    assert "logic" in matrix
    assert "evolution" in matrix
    assert "overall" in matrix
    assert '"version": "1.0"' in serialized
