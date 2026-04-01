import os
import sys

# Add relevant paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(BASE_DIR)
sys.path.append(os.path.join(BASE_DIR, ".agents", "scripts"))
sys.path.append(os.path.join(BASE_DIR, ".agents", "scripts", "empire"))

from compiler import EmpireCompiler

from src.core.sovereign_hud import SovereignHUD


def demonstrate():
    SovereignHUD.PERSONA = "ODIN"
    SovereignHUD.box_top("Ω IMPERIAL PROOF OF CONCEPT Ω")

    # 1. Locate Contract
    contract_path = "tests/contracts/contract_example.qmd"
    SovereignHUD.box_row("CONTRACT", contract_path, SovereignHUD.CYAN)

    # 2. Compile Contract
    compiler = EmpireCompiler()
    ir = compiler.compile(contract_path)
    SovereignHUD.box_row("PARSING", "SUCCESS (Tripartite IR)", SovereignHUD.GREEN)

    # 3. Generate Logic
    output_path = "tests/contracts/proof_of_concept.py"
    compiler.generate_boilerplate(ir, output_path)
    SovereignHUD.box_row("GENERATED", output_path, SovereignHUD.GREEN)

    # 4. Verify Generated File Exists
    if os.path.exists(output_path):
        SovereignHUD.box_row("FILE STATUS", "COMMITTED TO DISK", SovereignHUD.GREEN)

        # 5. Peak at content (Briefly)
        with open(output_path, encoding="utf-8") as f:
            lines = [line.strip() for line in f.readlines() if line.strip()]
            signature = next((line for line in lines if line.startswith("class Test")), lines[0] if lines else "EMPTY")
            SovereignHUD.box_row("SIGNATURE", signature, SovereignHUD.YELLOW)

    SovereignHUD.box_bottom()

if __name__ == "__main__":
    demonstrate()
