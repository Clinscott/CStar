from src.core.sovereign_hud import SovereignHUD
from src.sentinel._bootstrap import bootstrap

bootstrap()
print(f"Current Persona: {SovereignHUD.PERSONA}")
SovereignHUD.persona_log("INFO", "SovereignHUD Test Execution")
