#!/usr/bin/env python3
"""
[GAME] Odin Protocol Loop
Lore: "The cycle of conquest and genetic evolution."
Purpose: Central coordinator for the Odin Protocol Game Loop.
"""

import json
import os
import random
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from src.core.sovereign_hud import SovereignHUD
from src.games.odin_protocol.engine import (
    Chromosome,
    OdinGM,
    OdinPersistence,
    UniverseState,
    adjudicate_choice,
    calculate_effective_stats,
    get_federated_seed,
)

from .ui import OdinUI


class OdinAdventure:
    """The central coordinator for the Odin Protocol Game Loop."""

    def __init__(self, project_root: str | Path) -> None:
        """
        Initializes the adventure with the project root.

        Args:
            project_root: Path to the project root directory.
        """
        self.project_root = Path(project_root)
        self.persistence = OdinPersistence(str(self.project_root))
        self.gm = OdinGM()
        self.state: UniverseState = self._init_state()

        # UI Setup: Load persona from config
        config_path = self.project_root / "config.json"
        default_persona = "ALFRED"
        if config_path.exists():
            try:
                with config_path.open() as f:
                    config = json.load(f)
                    default_persona = (config.get("persona") or config.get("Persona") or "ALFRED").upper()
            except (json.JSONDecodeError, OSError):
                pass

        SovereignHUD.PERSONA = self.state.active_persona or default_persona

        # Prompt for name if this is a fresh start
        if self.state.player_name == "Odin":
            self.prompt_for_name()

    def prompt_for_name(self) -> None:
        """Asks the user for their Warlord name."""
        os.system('cls' if os.name == 'nt' else 'clear')
        SovereignHUD.divider("NAME YOUR WARLORD")
        print(f"\n{SovereignHUD.BOLD}The annals of Corvus await your legend.{SovereignHUD.RESET}")
        name = input(f"\n{SovereignHUD.CYAN}>> Enter your name, Warlord: {SovereignHUD.RESET}").strip()
        if name:
            self.state.player_name = name
        else:
            self.state.player_name = "Odin"

    def _init_state(self) -> UniverseState:
        """Loads existing state or initializes a new one from the Federated Seed."""
        saved = self.persistence.load_state()
        if saved:
            try:
                return UniverseState.from_dict(saved)
            except Exception as e:
                SovereignHUD.persona_log("WARN", f"Failed to restore state from dictionary: {e}")

        # New Game: 24 Chromosomes
        from src.games.odin_protocol.engine.logic import SYNERGY_MAP
        seed = get_federated_seed(str(self.project_root))
        dna = {}
        for cid in SYNERGY_MAP:
            name = cid.replace('_', ' ').title()
            dna[cid] = Chromosome(id=cid, name=name)

        return UniverseState(seed=seed, inventory=dna)

    def render_manifest(self, scenario: dict[str, Any] | None = None) -> None:
        """Displays the player's genetic stats and empire status (Delegated to OdinUI)."""
        OdinUI.render_manifest(self, scenario)

    def briefing(self, scenario: dict[str, Any] | None = None) -> None:
        """Strategic Briefing (Delegated to OdinUI)."""
        OdinUI.briefing(self, scenario)

    def mutation_screen(self) -> None:
        """Interactive genetic modification interface using mutation credits."""
        credits = self.state.total_worlds_conquered
        if credits <= 0:
            print(f"\n{SovereignHUD.YELLOW}No mutation credits available. Conquer a world first.{SovereignHUD.RESET}")
            time.sleep(2)
            return

        while credits > 0:
            os.system('cls' if os.name == 'nt' else 'clear')
            SovereignHUD.divider("GENETIC LABORATORY")
            print(f"{SovereignHUD.BOLD}Warlord {self.state.player_name}, you have {SovereignHUD.GREEN}{credits}{SovereignHUD.RESET} {SovereignHUD.BOLD}Mutation Credits Remaining.{SovereignHUD.RESET}\n")

            options = list(self.state.inventory.keys())
            for i, cid in enumerate(options):
                c = self.state.inventory[cid]
                print(f" [{i+1:2}] {c.name:20} (Lvl {c.level})")

            choice = input(f"\n{SovereignHUD.CYAN}>> Select Chromosome to mutate (or 'Q' to finish): {SovereignHUD.RESET}").upper()
            if choice == 'Q':
                break

            if choice.isdigit() and 1 <= int(choice) <= len(options):
                cid = options[int(choice) - 1]
                self.state.inventory[cid].level += 1
                credits -= 1
                print(f"\n{SovereignHUD.GREEN}SUCCESS: {cid} leveled up. Credits: {credits}{SovereignHUD.RESET}")
                self.show_ripple_effect(cid)
                time.sleep(2)

    def show_ripple_effect(self, source_id: str) -> None:
        """Visualizes how a change in one trait impacts others."""
        from odin_protocol.engine.logic import SYNERGY_MAP
        mapping = SYNERGY_MAP.get(source_id)
        if not mapping:
            return

        SovereignHUD.box_top("RIPPLE EFFECT TRACE")
        for target in mapping["synergies"]:
            SovereignHUD.box_row(f"  {target}", "+10% (Synergy)", SovereignHUD.CYAN)
        for target in mapping["interferences"]:
            SovereignHUD.box_row(f"  {target}", "-15% (Interference)", SovereignHUD.RED)
        SovereignHUD.box_bottom()

    def temporal_breach(self) -> None:
        """Implements the Phase 2 Git-Rollback mechanic: Temporal Breach."""
        SovereignHUD.divider("TEMPORAL BREACH ACTIVATED")
        print(f"{SovereignHUD.RED}[WARNING]: Manipulating the timeline causes Genetic Decay.{SovereignHUD.RESET}")

        try:
            subprocess.run(["git", "stash"], cwd=str(self.project_root), capture_output=True)
            log = subprocess.check_output(
                ["git", "log", "--oneline", "-n", "5"],
                cwd=str(self.project_root)
            ).decode("utf-8")

            print(f"\n{SovereignHUD.BOLD}Available Temporal Anchors:{SovereignHUD.RESET}")
            print(log)

            target = input(f"\n{SovereignHUD.CYAN}>> Enter Git Hash to breach into (or 'c' to cancel): {SovereignHUD.RESET}").strip()
            if target.lower() == 'c': return

            res = subprocess.run(["git", "checkout", target, "--", "odin_protocol/save_state.json"], cwd=str(self.project_root))

            if res.returncode == 0:
                print(f"{SovereignHUD.GREEN}Anchor Established. Reloading State...{SovereignHUD.RESET}")
                self.state = self._init_state()

                cid = random.choice(list(self.state.inventory.keys()))
                old_lvl = self.state.inventory[cid].level
                self.state.inventory[cid].level = max(1, old_lvl - 2)
                print(f"{SovereignHUD.RED}[CORRUPTION]: {cid} level dropped from {old_lvl} to {self.state.inventory[cid].level}.{SovereignHUD.RESET}")

                subprocess.run(["git", "add", "odin_protocol/save_state.json"], cwd=str(self.project_root))
                subprocess.run(["git", "commit", "-m", f"TEMPORAL_BREACH: {target}"], cwd=str(self.project_root))
                time.sleep(2)
            else:
                print(f"{SovereignHUD.RED}Failed to reach anchor. Timeline remains intact.{SovereignHUD.RESET}")

        except Exception as e:
            print(f"{SovereignHUD.RED}Breach Error: {e}{SovereignHUD.RESET}")

        input("\nPress Enter to return to the bridge...")

    def _apply_passive_ticker(self, affinity_score: float) -> None:
        """Applies passive domination growth/decay based on Genetic Affinity and Momentum."""
        velocity = affinity_score
        if self.state.momentum_turns > 0:
            velocity *= 1.5
            self.state.momentum_turns -= 1
        elif self.state.momentum_turns < 0:
            velocity *= 0.5
            self.state.momentum_turns += 1

        self.state.ticker_velocity = velocity
        self.state.current_planet_progress += velocity
        self.state.current_planet_progress = max(0.0, min(100.0, self.state.current_planet_progress))
        self.state.domination_percent = self.state.current_planet_progress

    def _strategic_phase(self) -> str | None:
        """Strategic selection phase in the War Room."""
        planet_name = self.state.current_planet_name
        self.render_manifest()
        SovereignHUD.divider("WAR ROOM: NODAL SELECTION")
        print(f"\n {SovereignHUD.BOLD}Warlord, the conquest of {planet_name.upper() if planet_name else 'THE SYSTEM'} continues.{SovereignHUD.RESET}")
        print(" Choose a tactical node to breach, or manage your manifest.")

        print("\n [X] Hive City Campaign")
        print(" [!] Siege Active Campaign")
        print(" [#] Resource Node Campaign")
        print(" [O] Warlord Drop Campaign")
        print("\n [M] Genetic Manifest")
        print(f" [P] Persona: {SovereignHUD.PERSONA}")
        print(" [Q] Save & Exit")

        cmd = input(f"\n{SovereignHUD.CYAN}>> Select Node or Protocol: {SovereignHUD.RESET}").upper().strip()

        if cmd == 'Q': sys.exit(0)
        if cmd == 'P':
            SovereignHUD.PERSONA = "ODIN" if SovereignHUD.PERSONA == "ALFRED" else "ALFRED"
            self.state.active_persona = SovereignHUD.PERSONA
            return None
        if cmd == 'M':
            effective = calculate_effective_stats(self.state.inventory, self.state.items)
            self.show_genetic_manifest(effective)
            input("\nPress Enter to return to the bridge...")
            return None

        node_map = {'X': 'HIVE', '!': 'SIEGE', '#': 'RESOURCE', 'O': 'DROP'}
        if cmd not in node_map:
            print(f"{SovereignHUD.RED}Invalid Node Identifier.{SovereignHUD.RESET}")
            time.sleep(1)
            return None

        target_node = node_map[cmd]
        self.state.active_node = target_node
        SovereignHUD.divider("WAR ROOM: LOCKING IN")
        print(f"{SovereignHUD.CYAN}Nodal Campaign identified. Forces deployed to {target_node}.{SovereignHUD.RESET}")
        time.sleep(1)
        return target_node

    def _tactical_phase(self, target_node: str, scenario: dict[str, Any], effective: dict[str, float]) -> None:
        """Tactical encounter decision loop."""
        self.render_manifest(scenario)
        SovereignHUD.divider(f"TACTICAL BREACH: {target_node}")
        print(f"\n{SovereignHUD.CYAN}{scenario['lore']}{SovereignHUD.RESET}")

        p = scenario['active_persona']
        print(f"\n{SovereignHUD.BOLD}{p['rank']} {p['name']} REPORT:{SovereignHUD.RESET}")
        print(f"{SovereignHUD.YELLOW}\"{scenario['conflict']}\"{SovereignHUD.RESET}")

        while True:
            SovereignHUD.divider(f"COMMAND DECK: {target_node}")
            print(f"\n{SovereignHUD.BOLD}{scenario['immediate_question']}{SovereignHUD.RESET}")

            options = scenario.get('options', [])
            for opt in options:
                diff = opt.get('difficulty', 'Unknown')
                color = SovereignHUD.GREEN if diff in ('Easy', 'Trivial') else (SovereignHUD.YELLOW if diff == 'Hard' else SovereignHUD.RED)
                print(f" [{opt['id']}] {opt['text']:35} ({color}{diff}{SovereignHUD.RESET})")

            print(f" [R] Retreat & Regroup           ({SovereignHUD.YELLOW}Penalty: 50% Node Progress{SovereignHUD.RESET})")

            raw_input = input(f"\n{SovereignHUD.CYAN}>> Deployment Choice: {SovereignHUD.RESET}").upper().strip()

            if raw_input == 'R':
                print(f"\n{SovereignHUD.YELLOW}[RETREAT]: Forces withdrawing. Node progress halved.{SovereignHUD.RESET}")
                self.state.nodal_progress[target_node] *= 0.5
                self.state.active_node = None
                time.sleep(2)
                return

            choice = next((o for o in options if o['id'] == raw_input), None)
            if not choice: continue

            result = adjudicate_choice(self.state, choice, effective, scenario)
            self._resolve_encounter(result, target_node)
            break

    def _resolve_encounter(self, result: dict[str, Any], target_node: str) -> None:
        """Updates state and UI based on the encounter outcome."""
        SovereignHUD.divider("DIE CAST RESULTS")
        print(f" {SovereignHUD.BOLD}CHANCE  :{SovereignHUD.RESET} {SovereignHUD.CYAN}{result['chance']*100:.1f}%{SovereignHUD.RESET}")
        print(f" {SovereignHUD.BOLD}ROLL    :{SovereignHUD.RESET} {SovereignHUD.YELLOW}{result['roll']*100:.1f}%{SovereignHUD.RESET}")

        if result['success']:
            print(f"\n{SovereignHUD.GREEN}[VICTORY]: Tactical objective secured.{SovereignHUD.RESET}")
            print(f" FORCE   : {SovereignHUD.YELLOW}{result['force_delta']:.1f}%{SovereignHUD.RESET} (Mitigated)")
            print(f" PROGRESS: {SovereignHUD.GREEN}+{result['dom_delta']:.1f}%{SovereignHUD.RESET}")

            gain = result['dom_delta']
            current = self.state.nodal_progress.get(target_node, 0.0)
            new_prog = min(24.0, current + gain)
            self.state.nodal_progress[target_node] = new_prog
            self.state.momentum_turns = 3

            if new_prog >= 24.0:
                print(f"{SovereignHUD.MAGENTA}{SovereignHUD.BOLD}\n[NODE SECURED]: Campaign objective attained at {target_node}.{SovereignHUD.RESET}")
                self.state.active_node = None

            ready_nodes = [v for k, v in self.state.nodal_progress.items() if v >= 24.0]
            if len(ready_nodes) >= 3 and sum(self.state.nodal_progress.values()) > 80.0:
                print(f"\n{SovereignHUD.MAGENTA}{SovereignHUD.BOLD}[WORLD DOMINATION ATTAINED]{SovereignHUD.RESET}")
                self.state.current_planet_progress = 100.0
        else:
            print(f"\n{SovereignHUD.RED}[DEFEAT]: Forces repelled. Resistance Resurgence triggered.{SovereignHUD.RESET}")
            print(f" FORCE   : {SovereignHUD.RED}{result['force_delta']:.1f}%{SovereignHUD.RESET}")
            print(f" PROGRESS: {SovereignHUD.RED}{result['dom_delta']:.1f}%{SovereignHUD.RESET}")
            if result['penalty_msg']:
                print(f" {SovereignHUD.RED}[PENALTY]: {result['penalty_msg']}{SovereignHUD.RESET}")

            current = self.state.nodal_progress.get(target_node, 0.0)
            self.state.nodal_progress[target_node] = max(0.0, current + result['dom_delta'])
            self.state.momentum_turns = -3

        self.state.force = max(0.0, min(100.0, self.state.force + result['force_delta']))
        if self.state.force <= 0:
            print(f"\n{SovereignHUD.RED}[TOTAL DEPLETION]: Forces broken. Campaign abandoned.{SovereignHUD.RESET}")
            self.state.active_node = None

        self.state.total_turns_played += 1
        self.persistence.save_state(self.state.to_dict(), self.state.current_planet_name, "Tactical Breach")
        input("\nPress Enter to return to the bridge...")

    def play_turn(self) -> None:
        """Executes the strategic War Room loop or a tactical nodal campaign."""
        turn_id = self.state.total_turns_played
        planet_name = self.state.current_planet_name

        target_node = self.state.active_node
        if not target_node:
            target_node = self._strategic_phase()
            if not target_node: return

        effective = calculate_effective_stats(self.state.inventory, self.state.items)
        campaign = self.state.active_campaigns.get(planet_name)

        scenario = self.gm.generate_scenario(
            stats=effective,
            seed=self.state.seed,
            turn_id=turn_id,
            player_name=self.state.player_name,
            campaign_data=campaign,
            node_type=target_node
        )

        self._apply_passive_ticker(scenario.get('affinity_score', 0.1))

        new_planet_name = scenario['planet_name']
        self.state.current_planet_name = new_planet_name
        self.state.active_campaigns[new_planet_name] = scenario['campaign_state']

        self._tactical_phase(target_node, scenario, effective)

    def show_genetic_manifest(self, effective: dict[str, float]) -> None:
        """Dedicated screen for synergy matrix and genetic data."""
        os.system('cls' if os.name == 'nt' else 'clear')
        SovereignHUD.divider("GENETIC MANIFEST")
        SovereignHUD.box_top("SYNERGY MATRIX (INFINITE SPIRAL)")
        sorted_dna = sorted(self.state.inventory.items(), key=lambda x: effective.get(x[0], 0.0), reverse=True)
        for cid, chromosome in sorted_dna:
            eff = effective.get(cid, 0.0)
            base = float(chromosome.level)
            ripple = eff - base
            color = SovereignHUD.YELLOW if ripple > 0 else (SovereignHUD.RED if ripple < 0 else SovereignHUD.CYAN)
            ripple_str = f"[+{ripple:.1f} SPIRAL]" if ripple > 0 else (f"[{ripple:.1f} DECAY]" if ripple < 0 else "[STABLE]")
            SovereignHUD.box_row(f">> {chromosome.name:15}", f"{eff:4.1f} {SovereignHUD.DIM}{ripple_str}{SovereignHUD.RESET}", color)
        SovereignHUD.box_bottom()

    def retell_conquest(self) -> None:
        """Generates a bardic summary of the conquered world's campaign."""
        os.system('cls' if os.name == 'nt' else 'clear')
        SovereignHUD.divider(f"CONQUEST TALE: {self.state.current_planet_name.upper()}")

        campaign = self.state.active_campaigns.get(self.state.current_planet_name)
        if not campaign:
            print(f"{SovereignHUD.RED}No campaign records found.{SovereignHUD.RESET}")
            time.sleep(2)
            return

        print(f"\n{SovereignHUD.BOLD}The Bard of the Void strikes a hollow chord...{SovereignHUD.RESET}")
        print(f"{SovereignHUD.CYAN}\"{campaign['intro_text']}\"{SovereignHUD.RESET}\n")

        history = campaign.get('history', [])
        if not history:
            print(f"{SovereignHUD.DIM}The conquest was swift, a silent shadow over the world.{SovereignHUD.RESET}")
        else:
            for entry in history:
                print(f" * Turn {entry['turn']}: {entry['choice']} for {entry['objective']}")

        print(f"\n{SovereignHUD.GREEN}{SovereignHUD.BOLD}SO IT WAS WRITTEN:{SovereignHUD.RESET}")
        print(f"{SovereignHUD.BOLD}Warlord {self.state.player_name} shattered the resistance of {self.state.current_planet_name}.{SovereignHUD.RESET}")
        print(f"{SovereignHUD.DIM}The world now feeds the Great Machine.{SovereignHUD.RESET}")

        input(f"\n{SovereignHUD.CYAN}Press Enter to leave this world's memory...{SovereignHUD.RESET}")

def main() -> None:
    """CLI entry point for the Odin Protocol Game Loop."""
    project_root = Path(__file__).resolve().parents[3]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    try:
        from src.cstar.core.client import ping_daemon
        ping_daemon(timeout=1.0)
    except Exception as e:
        print(f"\n{SovereignHUD.RED}[SYSTEM FAILURE] Cortex Daemon Offline. ({e}){SovereignHUD.RESET}")
        print(f"{SovereignHUD.DIM}The Sovereign Engine must be running to engage the Odin Protocol.{SovereignHUD.RESET}")
        sys.exit(1)

    game = OdinAdventure(project_root)

    os.system('cls' if os.name == 'nt' else 'clear')
    SovereignHUD.divider("AWAKENING ODIN")
    print(f"\n{SovereignHUD.BOLD}{SovereignHUD.CYAN}Hi. Would you like to play a game?{SovereignHUD.RESET}")
    if input(f"{SovereignHUD.DIM}(y/N): {SovereignHUD.RESET}").lower() != 'y':
        print(f"{SovereignHUD.YELLOW}Dormancy maintained.{SovereignHUD.RESET}")
        sys.exit(0)

    try:
        while True:
            game.play_turn()
    except KeyboardInterrupt:
        print(f"\n\n{SovereignHUD.YELLOW}[SYSTEM]: Connection severed by Warlord. Returning to dormancy...{SovereignHUD.RESET}")
        sys.exit(0)

if __name__ == "__main__":
    main()
