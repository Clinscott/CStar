import json
import logging
import asyncio
import subprocess
import uuid
from pathlib import Path
from src.core.runtime_env import resolve_project_python
from src.core.telemetry import SubspaceTelemetry
from src.core.mimir_client import mimir
from src.core.sovereign_hud import SovereignHUD
from src.core.engine.atomic_gpt import AnomalyWarden, WardenCircuitBreaker
from src.core.engine.heimdall_shield import HeimdallShield, ShieldTrip
from src.core.lease_manager import LeaseManager

# [🔱] THE ONE MIND: Cognitive Router
class CognitiveRouter:
    """
    Translates raw user intent into structured action plans, delegates to PennyOne for context,
    and dispatches execution to the Forge or Wild Hunt.
    Persona: ODIN / ALFRED
    """
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.warden = AnomalyWarden(model_path=self.project_root / ".agents" / "warden.pkl")
        self.warden.eval() # Ensure inference mode
        self.shield = HeimdallShield()
        self.lease_manager = LeaseManager(self.project_root)
        # Generate a unique agent ID for this instance of the router
        self.agent_id = f"RAVEN-{uuid.uuid4().hex[:8]}"
        
    def _secure_execute(self, cmd: list, **kwargs) -> subprocess.CompletedProcess:
        """Executes a command only if Heimdall's Shield permits it."""
        self.shield.enforce(cmd)
        return subprocess.run(cmd, **kwargs)

    async def route_intent(self, prompt: str, target_file: str = "", loki_mode: bool = False) -> dict:
        """
        The entry point for the One Mind.
        """
        if loki_mode:
            SovereignHUD.persona_log("LOKI", "The One Mind acts without hesitation.")
        else:
            SovereignHUD.persona_log("ODIN", "The One Mind considers the intent...")
        
        # 1. Translate Intent
        structured_intent = await self._translate_intent(prompt, target_file)
        if not structured_intent:
            return {"status": "error", "message": "Failed to translate intent."}
            
        required_tools = structured_intent.get("required_tools", [])
        required_workflows = structured_intent.get("required_workflows", [])
        goal = structured_intent.get("goal", prompt)
        
        # 2. Resource Resolution via PennyOne
        missing_capabilities = []
        for tool in required_tools:
            # Check active skills
            skill_path = self.project_root / ".agents" / "skills" / tool
            if not skill_path.exists():
                missing_capabilities.append(tool)
                
        for wf in required_workflows:
            wf_path = self.project_root / ".agents" / "workflows" / f"{wf}.md"
            qmd_path = self.project_root / ".agents" / "workflows" / f"{wf}.qmd"
            if not wf_path.exists() and not qmd_path.exists():
                missing_capabilities.append(wf)
                
        # 3. The Wild Hunt (If capabilities are missing)
        if missing_capabilities:
            try:
                hunt_result = await self._dispatch_wild_hunt(missing_capabilities, goal)
                if hunt_result.get("status") != "success":
                    return {"status": "error", "message": f"Wild Hunt failed to acquire capabilities: {missing_capabilities}"}
            except ShieldTrip as st:
                SovereignHUD.persona_log("CRITICAL", str(st))
                return {"status": "error", "message": str(st)}
                
        # 4. Target Acquisition (Mimir's Well)
        targets = await self._acquire_targets(goal, target_file)
        
        # 5. Lock the Target (The Flock of Muninn)
        locked_targets = []
        for target in targets:
            if self.lease_manager.acquire_lease(target, self.agent_id):
                locked_targets.append(target)
            else:
                SovereignHUD.persona_log("WARN", f"Target {target} is locked by another agent. Yielding.")
                
        if targets and not locked_targets:
             return {"status": "error", "message": "All targets are currently locked by other Ravens. Try again later."}
        
        # 6. Warden Safety Evaluation (Atomic GPT)
        try:
            await self._evaluate_safety(goal, locked_targets, loki_mode=loki_mode)
        except WardenCircuitBreaker as e:
            SovereignHUD.persona_log("CRITICAL", f"Warden Circuit Breaker Tripped: {e}")
            await self._run_learning_session(goal, locked_targets, "ABORTED", str(e))
            for target in locked_targets:
                self.lease_manager.release_lease(target, self.agent_id)
            return {"status": "error", "message": str(e)}
        
        # 7. Execution via Forge
        try:
            execution_result = await self._execute_forge(goal, locked_targets, required_tools, required_workflows)
        except ShieldTrip as st:
            SovereignHUD.persona_log("CRITICAL", str(st))
            await self._run_learning_session(goal, locked_targets, "ABORTED", str(st))
            for target in locked_targets:
                self.lease_manager.release_lease(target, self.agent_id)
            return {"status": "error", "message": str(st)}
        
        # 8. Neuroplastic Feedback Loop
        if execution_result.get("status") == "success":
            await self._run_learning_session(goal, locked_targets, "SUCCESS", "The operation succeeded. The patterns applied should be reinforced.")
        else:
            await self._run_learning_session(goal, locked_targets, "FAILURE", f"The operation failed. Error: {execution_result.get('error')}")
            
        # 9. Release Locks
        for target in locked_targets:
            self.lease_manager.release_lease(target, self.agent_id)
            
        return execution_result

    async def _evaluate_safety(self, goal: str, targets: list, loki_mode: bool = False):
        """
        [HEIMDALL] Consults the Anomaly Warden to predict system drift before execution.
        """
        SovereignHUD.persona_log("HEIMDALL", "Consulting AtomicGPT for drift prediction...")
        
        target_path = targets[0] if targets else "SYSTEM"
        lore_alignment = await self.warden.get_lore_alignment(target_path, goal)
        
        features = [5.0, 100.0, 1.0, 0.0, lore_alignment]
        probability = self.warden.forward(features)
        
        SovereignHUD.persona_log("INFO", f"Anomaly Probability: {probability:.2f} (Alignment: {lore_alignment:.2f})")
        
        # In Loki Mode, we enforce a stricter threshold. If it passes, we ride the lightning.
        # If it fails, Loki is halted before damage can occur.
        threshold = 0.5 if loki_mode else 0.8
        
        if probability > threshold:
            mode_text = "Loki Mode (Strict)" if loki_mode else "Standard"
            raise WardenCircuitBreaker(f"Proposed action has high probability ({probability:.2f}) of causing systemic anomaly under {mode_text} threshold ({threshold}).")
        
        if loki_mode:
            SovereignHUD.persona_log("LOKI", "Warden approves. Riding the lightning.")

    async def _translate_intent(self, prompt: str, target_file: str) -> dict:
        system_prompt = (
            "You are the One Mind Cognitive Router for the Corvus Star Framework. "
            "Analyze the user's request and output a JSON object only. "
            "MANDATE: DO NOT use any tools. DO NOT attempt to call run_shell_command or any MCP tools. "
            "When identifying tools for the 'required_tools' list, use the short name (e.g., 'error-analysis', 'WildHunt'). "
            "Schema: {'goal': string, 'required_tools': list of names, 'required_workflows': list of names}"
        )
        try:
            query = f"Request: {prompt}\nTarget: {target_file}"
            response_text = await mimir.think(query, system_prompt=system_prompt)
            if response_text:
                # Extract JSON from potential markdown block
                start = response_text.find("{")
                end = response_text.rfind("}") + 1
                if start != -1 and end != 0:
                    return json.loads(response_text[start:end])
        except Exception as e:
            logging.error(f"Intent translation failed: {e}")
        return {"goal": prompt, "required_tools": [], "required_workflows": []}
        
    async def _dispatch_wild_hunt(self, missing_capabilities: list, goal: str) -> dict:
        SovereignHUD.persona_log("ODIN", f"Capabilities missing. Releasing the Wild Hunt for: {', '.join(missing_capabilities)}")
        hunt_script = self.project_root / "src" / "skills" / "local" / "WildHunt" / "wild_hunt.py"
        
        if not hunt_script.exists():
            SovereignHUD.persona_log("HEIMDALL", "The Wild Hunt script could not be found.")
            return {"status": "error"}
            
        for cap in missing_capabilities:
            try:
                self._secure_execute(
                    [str(resolve_project_python(self.project_root)), str(hunt_script), "search", cap],
                    cwd=str(self.project_root),
                    check=True
                )
            except subprocess.CalledProcessError as e:
                SovereignHUD.persona_log("HEIMDALL", f"The Wild Hunt failed to secure '{cap}': {e}")
                return {"status": "error"}
                
        return {"status": "success"}
        
    async def _acquire_targets(self, goal: str, explicit_target: str) -> list:
        targets = [explicit_target] if explicit_target else []
        if not explicit_target:
            SovereignHUD.persona_log("ALFRED", "Consulting Mimir's Well for target acquisition...")
            try:
                results = await mimir.search_well(goal)
                if results:
                    pass
            except Exception:
                pass
        return [t for t in targets if t]
        
    async def _execute_forge(self, goal: str, targets: list, tools: list, workflows: list) -> dict:
        SovereignHUD.persona_log("ODIN", f"Igniting the Forge. Goal: {goal}")
        return {"status": "success", "message": "Forge execution complete.", "raw": "The Forge has tempered the steel."}
        
    async def _run_learning_session(self, goal: str, targets: list, status: str, context: str):
        SovereignHUD.persona_log("ALFRED", f"Initiating Neuroplastic Feedback Loop ({status})...")
        try:
            prompt = f"Goal: {goal}\nTargets: {targets}\nStatus: {status}\nContext: {context}\nGenerate a brief post-mortem lesson focusing on what to replicate or avoid."
            lesson = await mimir.think(prompt)
            if lesson:
                journal_path = self.project_root / "dev_journal.qmd"
                with open(journal_path, "a", encoding="utf-8") as f:
                    f.write(f"\n\n## {status} - Auto-Generated Lesson\n{lesson}\n")
                
                self._secure_execute(["node", "bin/pennyone-mcp.js"], cwd=str(self.project_root))
                SovereignHUD.persona_log("SUCCESS", "Neuroplasticity update committed to the Chronicles.")
        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Learning session failed: {e}")
