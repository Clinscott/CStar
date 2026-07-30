from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_direct_provider_probe_boundary_is_documented() -> None:
    document = (
        ROOT / "docs" / "operations" / "direct-provider-probe-boundary.md"
    ).read_text(encoding="utf-8")

    assert "legacy_adc_provider_probe_retired_use_supported_host_provider_surface" in document
    assert "ambient `GOOGLE_API_KEY` does not activate provider behavior" in document
    assert "not authority to run a live provider call" in document
