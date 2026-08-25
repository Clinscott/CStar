from pathlib import Path

import pytest

from scripts.drift_audit import DriftAuditor


class _GungnirStub:
    def audit_logic(self, code: str, ext: str) -> list[dict[str, str]]:
        assert code == "source"
        assert ext == ".py"
        return [{"severity": "LOW", "action": "test breach"}]

    def score_matrix(self, code: str, ext: str) -> dict[str, float]:
        assert code == "source"
        assert ext == ".py"
        return {"overall": 7.25}


def test_drift_audit_uses_the_canonical_gungnir_matrix_score(tmp_path: Path) -> None:
    target = tmp_path / "sample.py"
    target.write_text("source", encoding="utf-8")
    auditor = DriftAuditor()
    auditor.gungnir = _GungnirStub()

    score, breaches = auditor._score_file(target)

    assert score == 7.25
    assert breaches == 1


@pytest.mark.parametrize(
    "matrix",
    [{"overall": 100.0}, {}, {"overall": float("nan")}],
)
def test_drift_audit_fails_closed_on_malformed_matrix_scores(
    tmp_path: Path,
    matrix: dict[str, float],
) -> None:
    class InvalidGungnirStub(_GungnirStub):
        def score_matrix(self, code: str, ext: str) -> dict[str, float]:
            return matrix

    target = tmp_path / "sample.py"
    target.write_text("source", encoding="utf-8")
    auditor = DriftAuditor()
    auditor.gungnir = InvalidGungnirStub()

    assert auditor._score_file(target) == (0.0, 0)
