import pytest
from src.cstar.core.forge import Forge

class TestForgeGungnirCalculus:
    @pytest.fixture
    def forge(self):
        return Forge()

    def test_forge_detects_claustrophobic_python(self, forge):
        # Create a function with > 12 consecutive logic lines
        bad_python = "def test_claustrophobia():\n" + "\n".join([f"    x_{i} = {i}" for i in range(15)])
        breaches = forge._verify_gungnir_calculus(bad_python, '.py')
        assert any("Claustrophobic code block" in b for b in breaches)

    def test_forge_detects_top_heavy_python(self, forge):
        # Create a function with high setup-to-execution ratio
        # 4 setups (Assignments), 1 execution (Return) -> Ratio 4.0 (> 1.7)
        top_heavy_python = """
def top_heavy_func():
    x = 1
    y = 2
    z = 3
    a = 4
    return x + y + z + a
"""
        breaches = forge._verify_gungnir_calculus(top_heavy_python, '.py')
        assert any("top-heavy setup" in b for b in breaches)

    def test_forge_detects_ugly_react(self, forge):
        # Low Birkhoff Measure (High complexity, low order)
        # and excessive arbitrary pixel sizes
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
        breaches = forge._verify_gungnir_calculus(bad_jsx, '.tsx')
        assert any("Birkhoff Measure" in b for b in breaches)
        assert any("arbitrary pixel sizes" in b for b in breaches)

    def test_forge_passes_beautiful_code(self, forge):
        good_python = """
def beautiful_function():
    data = extract_data()
    
    if not data:
        return False
        
    return process(data)
"""
        breaches = forge._verify_gungnir_calculus(good_python, '.py')
        assert len(breaches) == 0

    def test_forge_passes_symmetric_react(self, forge):
        good_jsx = """
        <div className="flex flex-col items-center justify-center p-8 mx-auto">
            <span className="text-lg leading-relaxed font-bold">Harmony</span>
            <span className="text-lg leading-relaxed font-bold">Symmetry</span>
            <button className="flex justify-center p-4 w-full">Click</button>
            <button className="flex justify-center p-4 w-full">Submit</button>
        </div>
        """
        breaches = forge._verify_gungnir_calculus(good_jsx, '.tsx')
        assert len(breaches) == 0
