
import pytest

from src.sentinel.wardens.freya import FreyaWarden


@pytest.fixture
def mock_project(tmp_path):
    """Creates a mock project with a TSX file for Freya."""
    tsx_file = tmp_path / "Button.tsx"
    # A button with no hover state and an arbitrary pixel value
    content = '<button className="bg-[123px] text-white">Click Me</button>'
    tsx_file.write_text(content, encoding='utf-8')
    return tmp_path

def test_freya_warden_scan(mock_project):
    """Verifies that Freya detects hover missing and arbitrary values."""
    warden = FreyaWarden(mock_project)
    # We don't have color_theory.json, so those checks should be skipped gracefully

    results = warden.scan()

    assert any(r["type"] == "FREYA_HOVER_MISSING" for r in results)
    assert any(r["type"] == "FREYA_TAILWIND_ARBITRARY" for r in results)
