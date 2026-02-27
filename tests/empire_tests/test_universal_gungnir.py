import pytest
from src.core.engine.gungnir.universal import UniversalGungnir

class TestUniversalGungnir:
    
    def test_logic_python_claustrophobia(self):
        bad_py = "x = 1\n" * 15 # Over 12 lines without whitespace
        breaches = UniversalGungnir.audit(bad_py, ".py")
        assert any("Claustrophobic" in b for b in breaches)
        
    def test_logic_typescript_birkhoff(self):
        # High complexity, low order (no symmetric classes)
        bad_ts = """
        const UI = () => (
            <div className="w-[10px] h-[20px] absolute top-1 left-2 bg-red-500 m-1 p-1 z-50">
                <span className="text-xs">1</span>
                <span className="text-sm">2</span>
                <span className="text-lg">3</span>
                <div className="border border-black">4</div>
                <div className="bg-white">5</div>
                <div className="shadow-lg">6</div>
            </div>
        );
        """
        breaches = UniversalGungnir.audit(bad_ts, ".tsx")
        assert any("Birkhoff Measure" in b for b in breaches)

    def test_style_css_dissonance(self):
        # Raw pixel values, no variables
        bad_css = """
        .card {
            width: 300px;
            height: 200px;
            background: #ffffff;
            border: 1px solid #000000;
            margin: 10px;
            padding: 20px;
            color: #333333;
            font-size: 14px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        """
        breaches = UniversalGungnir.audit(bad_css, ".css")
        assert any("GUNGNIR_STYLE_BREACH" in b for b in breaches)

    def test_data_json_nesting(self):
        bad_json = '{"a": {"b": {"c": {"d": {"e": {"f": {"g": "too deep"}}}}}}}'
        breaches = UniversalGungnir.audit(bad_json, ".json")
        assert any("Excessive data nesting" in b for b in breaches)

    def test_structure_markdown_density(self):
        bad_md = "This is a line without any headers or alerts.\n" * 60
        breaches = UniversalGungnir.audit(bad_md, ".md")
        assert any("GUNGNIR_DOCS_BREACH" in b for b in breaches)
        
    def test_harmony_pass(self):
        # Beautiful Python
        good_py = "def test():\n    # Setup\n    x = 1\n\n    # Exec\n    return x\n"
        assert len(UniversalGungnir.audit(good_py, ".py")) == 0
        
        # Symmetrical TSX
        good_tsx = '<div className="flex items-center justify-center p-8 mx-auto"></div>'
        assert len(UniversalGungnir.audit(good_tsx, ".tsx")) == 0
        
        # Tokenized CSS
        good_css = ".card { color: var(--text-primary); margin: var(--space-2); }"
        assert len(UniversalGungnir.audit(good_css, ".css")) == 0
