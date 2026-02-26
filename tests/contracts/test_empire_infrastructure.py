import os
import sys
import unittest

# Add script paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EMPIRE_DIR = os.path.join(BASE_DIR, ".agent", "scripts", "empire")
sys.path.append(EMPIRE_DIR)

from compiler import EmpireCompiler
from symbolic_legend import SymbolicLegend


class TestEmpireInfrastructure(unittest.TestCase):

    def setUp(self):
        self.compiler = EmpireCompiler()
        self.legend = SymbolicLegend()
        self.contract_path = os.path.join(BASE_DIR, "tests", "contracts", "contract_example.qmd")

    def test_compilation_to_ir(self):
        """Verify .qmd to IR transformation."""
        ir = self.compiler.compile(self.contract_path)

        self.assertEqual(len(ir['given']), 1)
        self.assertEqual(len(ir['when']), 1)
        self.assertEqual(len(ir['then']), 1)

        self.assertIn("Premium [$]", ir['given'][0])
        self.assertIn("Export PDF", ir['when'][0])

    def test_symbol_resolution(self):
        """Verify shorthand expansion."""
        symbol = "[$]"
        resolved = self.legend.resolve(symbol)
        self.assertEqual(resolved['tier'], 'premium')

    def test_boilerplate_generation(self):
        """Verify generated code structure."""
        ir = self.compiler.compile(self.contract_path)
        # Use a temp file to avoid depending on tests/empire/ directory existing
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = os.path.join(tmpdir, "test_generated_contract.py")

            self.compiler.generate_boilerplate(ir, output_path)

            self.assertTrue(os.path.exists(output_path))

            with open(output_path, encoding="utf-8") as f:
                content = f.read()
                self.assertIn("class TestContract_example(unittest.TestCase):", content)
                self.assertIn("# User is Premium [$]", content)

if __name__ == '__main__':
    unittest.main()
