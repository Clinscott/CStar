import json
import sys
from pathlib import Path

import pytest

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

    def test_birkhoff_measure_breach(self, tmp_path, warden):
        bad_jsx = """
        <div className="w-[12px] h-[33px] bg-[#000] absolute float-left m-[1px] p-[2px]">
            <span className="text-[11px]">Hello</span>
            <span className="text-[12px]">World</span>
            <span className="text-[13px]">Chaos</span>
            <button className="bg-red-500 padding-[2px]">Click</button>
            <button className="bg-blue-500 p-[3px]">Go</button>
            <button className="bg-green-500 m-[4px]">Run</button>
        </div>
        """
        tsx_path = tmp_path / "Ugly.tsx"
        tsx_path.write_text(bad_jsx, encoding='utf-8')

        results = warden.scan()
        assert any(r['type'] == "FREYA_BIRKHOFF_BREACH" for r in results)

    def test_golden_ratio_breach(self, tmp_path, warden):
        bad_jsx = """
        <div className="p-[17px] w-[314px] mt-[19px]">
            <span className="text-[13px] leading-[15px]">Ugly typography</span>
            <div className="m-[22px] p-[11px]">Dissonance</div>
        </div>
        """
        tsx_path = tmp_path / "Dissonant.tsx"
        tsx_path.write_text(bad_jsx, encoding='utf-8')

        results = warden.scan()
        assert any(r['type'] == "FREYA_GOLDEN_RATIO_BREACH" for r in results)

    def test_aesthetic_pass(self, tmp_path, warden):
        good_jsx = """
        <div className="flex flex-col items-center justify-center p-8 mx-auto">
            <span className="text-lg leading-relaxed font-bold">Harmony</span>
            <span className="text-lg leading-relaxed font-bold">Symmetry</span>
            <button className="flex justify-center p-4 w-full">Click</button>
            <button className="flex justify-center p-4 w-full">Submit</button>
        </div>
        """
        tsx_path = tmp_path / "Beautiful.tsx"
        tsx_path.write_text(good_jsx, encoding='utf-8')

        results = warden.scan()
        # Should NOT find Birkhoff or Golden Ratio breaches
        assert not any(r['type'] in ("FREYA_BIRKHOFF_BREACH", "FREYA_GOLDEN_RATIO_BREACH") for r in results)
