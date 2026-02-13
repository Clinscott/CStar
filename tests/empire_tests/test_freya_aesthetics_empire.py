import pytest
import os
import sys
import json
from pathlib import Path

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.sentinel.muninn import FreyaWarden

class TestFreyaWarden:
    @pytest.fixture
    def warden(self, tmp_path):
        return FreyaWarden(tmp_path)

    @pytest.fixture
    def color_theory(self, tmp_path):
        core_dir = tmp_path / "src" / "core"
        core_dir.mkdir(parents=True)
        theory_path = core_dir / "color_theory.json"
        theory = {
            "palettes": {
                "primary": {"main": "#123456"}
            }
        }
        theory_path.write_text(json.dumps(theory), encoding='utf-8')
        return theory_path

    def test_scan_finds_hover_breach(self, tmp_path, warden):
        tsx_path = tmp_path / "Button.tsx"
        tsx_path.write_text('<button className="bg-blue-500">Click me</button>', encoding='utf-8')
        
        results = warden.scan()
        assert len(results) == 1
        assert "Add hover state" in results[0]['action']

    def test_scan_finds_color_breach(self, tmp_path, warden, color_theory):
        tsx_path = tmp_path / "Theme.tsx"
        tsx_path.write_text('<div style={{ color: "#abcdef" }}>Text</div>', encoding='utf-8')
        
        results = warden.scan()
        # Filter for BEAUTY_BREACH with color message
        color_breaches = [r for r in results if "Non-standard color" in r['action']]
        assert len(color_breaches) == 1
        assert "#abcdef" in color_breaches[0]['action']
