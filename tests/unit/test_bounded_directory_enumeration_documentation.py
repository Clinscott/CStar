from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_bounded_directory_enumeration_is_documented() -> None:
    documentation = (ROOT / "docs/operations/bounded-directory-enumeration.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_bounded_directory_enumeration.feature").read_text(
        encoding="utf-8"
    )
    for required in ("20,000 entries", "5,000 directory entries", "2,048 entries", "fails closed"):
        assert required in documentation
    assert "consumed incrementally under a fixed cap" in feature
