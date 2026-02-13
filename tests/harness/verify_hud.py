from src.core.ui import HUD
from src.sentinel._bootstrap import bootstrap

bootstrap()
print(f"Current Persona: {HUD.PERSONA}")
HUD.persona_log("INFO", "HUD Test Execution")
