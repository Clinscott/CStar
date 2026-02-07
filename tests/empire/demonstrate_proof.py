import sys
import os

# Add relevant paths
BASE_DIR = os.getcwd()
sys.path.append(os.path.join(BASE_DIR, ".agent", "scripts"))
sys.path.append(os.path.join(BASE_DIR, ".agent", "scripts", "empire"))

from compiler import EmpireCompiler
from ui import HUD

def demonstrate():
    HUD.PERSONA = "ODIN"
    HUD.box_top("Ω IMPERIAL PROOF OF CONCEPT Ω")
    
    # 1. Locate Contract
    contract_path = "tests/empire/contract_example.qmd"
    HUD.box_row("CONTRACT", contract_path, HUD.CYAN)
    
    # 2. Compile Contract
    compiler = EmpireCompiler()
    ir = compiler.compile(contract_path)
    HUD.box_row("PARSING", "SUCCESS (Tripartite IR)", HUD.GREEN)
    
    # 3. Generate Logic
    output_path = "tests/empire/proof_of_concept.py"
    compiler.generate_boilerplate(ir, output_path)
    HUD.box_row("GENERATED", output_path, HUD.GREEN)
    
    # 4. Verify Generated File Exists
    if os.path.exists(output_path):
        HUD.box_row("FILE STATUS", "COMMITTED TO DISK", HUD.GREEN)
        
        # 5. Peak at content (Briefly)
        with open(output_path, "r") as f:
            lines = f.readlines()
            HUD.box_row("SIGNATURE", lines[5].strip(), HUD.YELLOW)
    
    HUD.box_bottom()

if __name__ == "__main__":
    demonstrate()
