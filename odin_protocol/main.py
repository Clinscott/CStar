import argparse
import json
import os
import sys
import time

# Add project root to path for local imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from odin_protocol.engine import (
    Chromosome,
    Item,
    OdinGM,
    OdinPersistence,
    UniverseState,
    adjudicate_choice,
    calculate_effective_stats,
    get_combat_rating,
    get_federated_seed,
    trigger_restart,
    update_domination,
)

# [ALFRED] Importing the Corvus Star UI Backbone
try:
    # Need to add .agent/scripts to path for ui.py
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".agent", "scripts")))
    from ui import HUD
except ImportError:
    # Fallback if UI is missing
    class HUD:
        PERSONA = "ALFRED"
        CYAN, RED, RESET, BOLD, DIM, GREEN, YELLOW = "", "", "", "", "", "", ""
        @staticmethod
        def box_top(t="") -> None: print(f"--- {t} ---")
        @staticmethod
        def box_row(l, v, c="", dim_label=False) -> None: print(f"{l}: {v}")
        @staticmethod
        def box_separator() -> None: print("-" * 20)
        @staticmethod
        def box_bottom() -> None: print("-" * 20)
        @staticmethod
        def progress_bar(v) -> str: return "[#]"
        @staticmethod
        def divider(l="") -> None: print(f"=== {l} ===")

class OdinAdventure:
    """The central coordinator for the Odin Protocol Game Loop."""

    def __init__(self, project_root: str):
        self.project_root = project_root
        self.persistence = OdinPersistence(project_root)
        self.gm = OdinGM()
        self.state = self._init_state()

        # UI Setup
        config_path = os.path.join(project_root, "config.json")
        if os.path.exists(config_path):
            with open(config_path) as f:
                config = json.load(f)
                HUD.PERSONA = (config.get("persona") or config.get("Persona") or "ALFRED").upper()

        # Prompt for name if this is a fresh start or default
        if self.state.player_name == "Odin":
            self.prompt_for_name()

    def prompt_for_name(self) -> None:
        """Asks the user for their Warlord name."""
        os.system('cls' if os.name == 'nt' else 'clear')
        HUD.divider("NAME YOUR WARLORD")
        print(f"\n{HUD.BOLD}The annals of Corvus await your legend.{HUD.RESET}")
        name = input(f"\n{HUD.CYAN}>> Enter your name, Warlord: {HUD.RESET}").strip()
        if name:
            self.state.player_name = name
        else:
            self.state.player_name = "Odin"

    def _init_state(self) -> UniverseState:
        """Loads existing state or initializes a new one from the Federated Seed."""
        saved = self.persistence.load_state()
        if saved:
            inventory = {
                k: Chromosome(**v) for k, v in saved.get("inventory", {}).items()
            }
            items = [Item(**i) for i in saved.get("items", [])]
            return UniverseState(
                seed=saved["seed"],
                player_name=saved.get("player_name", "Odin"),
                domination_percent=saved.get("domination_percent", 10.0),
                max_percent_reached=saved.get("max_percent_reached", 10.0),
                total_worlds_conquered=saved.get("total_worlds_conquered", 0),
                domination_count=saved.get("domination_count", 0),
                current_planet_name=saved.get("current_planet_name"),
                current_planet_progress=saved.get("current_planet_progress", 0.0),
                last_briefing_turn=saved.get("last_briefing_turn", -5),
                inventory=inventory,
                items=items,
                conquests=saved.get("conquests", [])
            )

        # New Game: 24 Chromosomes
        from odin_protocol.engine.logic import SYNERGY_MAP
        seed = get_federated_seed(self.project_root)
        dna = {}
        for cid in SYNERGY_MAP:
            # Extract name from CID (e.g., 'AESIR_MIGHT' -> 'Aesir Might')
            name = cid.replace('_', ' ').title()
            dna[cid] = Chromosome(id=cid, name=name)

        return UniverseState(seed=seed, inventory=dna)

    def render_manifest(self) -> None:
        """Displays the player's genetic stats and empire status."""
        effective = calculate_effective_stats(self.state.inventory, self.state.items)
        rating = get_combat_rating(effective)

        HUD.box_top("DOMINION STATUS")
        percent_color = HUD.GREEN if self.state.domination_percent > 50 else HUD.YELLOW
        if self.state.domination_percent < 20: percent_color = HUD.RED

        HUD.box_row("DOMINATION", f"{self.state.domination_percent:.1f}%", percent_color)
        HUD.box_row("MAX REACHED", f"{self.state.max_percent_reached:.1f}%", HUD.DIM)
        HUD.box_row("WARLORD", self.state.player_name, HUD.YELLOW)
        HUD.box_row("WORLDS CONQUERED", f"{self.state.total_worlds_conquered}", HUD.CYAN)
        HUD.box_row("COMBAT RATING", f"{rating:.2f}", HUD.BOLD)

        # Planet Progress
        if self.state.current_planet_name:
            HUD.box_row("TARGET", self.state.current_planet_name.upper(), HUD.CYAN)
            HUD.box_row("PROGRESS", f"{self.state.current_planet_progress:.1f}%", HUD.GREEN)

        HUD.box_separator()

        # Inventory (Items)
        if self.state.items:
            HUD.box_row("EQUIPMENT", f"{len(self.state.items)} Active Items", HUD.YELLOW)
            for item in self.state.items:
                HUD.box_row(f" - {item.name}", f"({item.category})", HUD.DIM)
            HUD.box_separator()

        HUD.box_row("GENETIC MANIFEST", "", HUD.DIM)
        # Sort by effective level to show significance
        sorted_dna = sorted(self.state.inventory.items(), key=lambda x: effective[x[0]], reverse=True)
        for cid, chromosome in sorted_dna[:8]: # Show top 8 for brevity
            eff_level = effective.get(cid, 0.0)
            color = HUD.CYAN if eff_level >= chromosome.level else HUD.RED
            HUD.box_row(f"  {chromosome.name}", f"Lvl {eff_level:.1f}", color)

        if len(sorted_dna) > 8:
            HUD.box_row("  ...", f"+{len(sorted_dna)-8} others", HUD.DIM)

        HUD.box_bottom()

    def briefing(self) -> None:
        """Alfred's Detailed Tactical Scan.

        Provides a deep dive into synergy impacts and environmental vulnerabilities.
        """
        turn = self.state.total_worlds_conquered + int(self.state.domination_percent)
        cooldown = 3

        if turn < self.state.last_briefing_turn + cooldown:
            remaining = (self.state.last_briefing_turn + cooldown) - turn
            print(f"\n{HUD.YELLOW}[ALFRED'S REMINDER]: Scanners are still cooling down, sir. Approximate wait: {remaining} turns.{HUD.RESET}")
            time.sleep(2)
            return

        os.system('cls' if os.name == 'nt' else 'clear')
        HUD.divider("ALFRED'S TACTICAL BRIEFING")
        print(f"{HUD.BOLD}Analysis of the Current Manifest for Warlord {self.state.player_name}...{HUD.RESET}\n")

        effective = calculate_effective_stats(self.state.inventory, self.state.items)

        # 1. Synergy Highlights
        HUD.box_top("SYNERGY OVERVIEW")
        for cid, chromosome in self.state.inventory.items():
            eff = effective[cid]
            base = float(chromosome.level)
            if eff > base:
                diff = eff - base
                HUD.box_row(f"{chromosome.name}", f"+{diff:.1f} (Synergized)", HUD.CYAN)
        HUD.box_bottom()

        # 2. Interference Alerts
        HUD.box_top("CRITICAL VULNERABILITIES")
        found_vuln = False
        for cid, chromosome in self.state.inventory.items():
            eff = effective[cid]
            base = float(chromosome.level)
            if eff < base:
                diff = base - eff
                HUD.box_row(f"{chromosome.name}", f"-{diff:.1f} (Interference)", HUD.RED)
                found_vuln = True

        if not found_vuln:
            HUD.box_row("GENETIC COHESION", "100% - No interferences detected.", HUD.GREEN)
        HUD.box_bottom()

        self.state.last_briefing_turn = turn
        input(f"\n{HUD.DIM}Press Enter to return to the command deck...{HUD.RESET}")

    def mutation_screen(self) -> None:
        """Interactive genetic modification interface using mutation credits."""
        credits = self.state.total_worlds_conquered
        if credits <= 0:
            print(f"\n{HUD.YELLOW}No mutation credits available. Conquer a world first.{HUD.RESET}")
            time.sleep(2)
            return

        while credits > 0:
            os.system('cls' if os.name == 'nt' else 'clear')
            HUD.divider("GENETIC LABORATORY")
            print(f"{HUD.BOLD}Warlord {self.state.player_name}, you have {HUD.GREEN}{credits}{HUD.RESET} {HUD.BOLD}Mutation Credits Remaining.{HUD.RESET}\n")

            options = list(self.state.inventory.keys())
            for i, cid in enumerate(options):
                c = self.state.inventory[cid]
                print(f" [{i+1:2}] {c.name:20} (Lvl {c.level})")

            choice = input(f"\n{HUD.CYAN}>> Select Chromosome to mutate (or 'Q' to finish): {HUD.RESET}").upper()
            if choice == 'Q':
                break

            if choice.isdigit() and 1 <= int(choice) <= len(options):
                cid = options[int(choice) - 1]
                self.state.inventory[cid].level += 1
                credits -= 1
                print(f"\n{HUD.GREEN}SUCCESS: {cid} leveled up. Credits: {credits}{HUD.RESET}")
                self.show_ripple_effect(cid)
                time.sleep(2)

    def show_ripple_effect(self, source_id: str) -> None:
        """Visualizes how a change in one trait impacts others."""
        from odin_protocol.engine.logic import SYNERGY_MAP
        mapping = SYNERGY_MAP.get(source_id)
        if not mapping:
            return

        HUD.box_top("RIPPLE EFFECT TRACE")
        for target in mapping["synergies"]:
            HUD.box_row(f"  {target}", "+10% (Synergy)", HUD.CYAN)
        for target in mapping["interferences"]:
            HUD.box_row(f"  {target}", "-15% (Interference)", HUD.RED)
        HUD.box_bottom()

    def play_turn(self) -> None:
        """Executes a single step in the long-term conquest of a planet."""
        # 1. Refresh Stats
        effective = calculate_effective_stats(self.state.inventory, self.state.items)

        # 2. Target Management
        if not self.state.current_planet_name:
            self.state.current_planet_progress = 0.0

        # 3. PHASE I: THE VISION (Story & Prelude)
        HUD.divider("SCANNING FOR TARGETS")

        # Turn ID is calculated from conquest counts to ensure seed variety
        turn_id = self.state.total_worlds_conquered + int(self.state.domination_percent)

        scenario = self.gm.generate_scenario(
            stats=effective,
            seed=self.state.seed,
            turn_id=turn_id,
            current_planet=self.state.current_planet_name
        )

        if not self.state.current_planet_name:
            self.state.current_planet_name = scenario['planet_name']

        HUD.box_top(f"PLANET: {self.state.current_planet_name.upper()}")
        HUD.box_row("PROGRESS", f"{self.state.current_planet_progress:.1f}%", HUD.GREEN)
        print(f"\n{HUD.BOLD}{HUD.CYAN}[THE VISION]{HUD.RESET}\n")
        print(f"{HUD.DIM}{scenario.get('prelude', 'The stars remain silent...')}{HUD.RESET}")
        print(f"\n{HUD.RED}HAZARD: {scenario['environmental_hazard']}{HUD.RESET}")
        print(f"{HUD.YELLOW}PRESSURE: {scenario.get('evolutionary_pressure', 'Intense')}{HUD.RESET}")

        # 4. PHASE II: THE HANDSHAKE (Agent Briefing Signal)
        # Save active scenario for the Agent (Alfred) to monitor outside the game
        with open(os.path.join(self.project_root, "odin_protocol", "active_scenario.json"), "w") as f:
            json.dump(scenario, f, indent=4)

        print(f"\n{HUD.CYAN}Synchronizing with the Brain...{HUD.RESET}")
        print(f"{HUD.BOLD}{HUD.YELLOW}[SIGNAL DETECTED]: Check Agent Chat for Tactical Briefing.{HUD.RESET}")
        print(f"{HUD.DIM}(Tip: Type 'B' for Alfred's Detailed Scan in the next menu){HUD.RESET}\n")

        # 5. PHASE III: THE DECISION LOOP
        while True:
            HUD.divider(f"COMMAND DECK: {self.state.current_planet_name.upper()}")
            print(f"\n{HUD.BOLD}{scenario['immediate_question']}{HUD.RESET}\n")

            options = scenario.get('options', [])
            for opt in options:
                diff = opt.get('difficulty', 'Unknown')
                if diff == 'Easy': color = HUD.GREEN
                elif diff == 'Normal': color = HUD.CYAN
                elif diff == 'Hard': color = HUD.YELLOW
                else: color = HUD.RED # Gamble/Dangerous

                print(f" [{opt['id']}] {opt['text']:35} ({color}{diff}{HUD.RESET})")

            print("\n [B] Run Tactical Briefing (Alfred)")
            print(" [M] View Genetic Manifest")
            print(" [Q] Quit to Framework")

            raw_input = input(f"\n{HUD.CYAN}>> Your command, Warlord: {HUD.RESET}").upper().strip()

            if raw_input == 'Q':
                print(f"{HUD.YELLOW}Dormancy activated. History preserved.{HUD.RESET}")
                sys.exit(0)
            elif raw_input == 'B':
                self.briefing()
                os.system('cls' if os.name == 'nt' else 'clear')
                self.render_manifest()
                continue
            elif raw_input == 'M':
                os.system('cls' if os.name == 'nt' else 'clear')
                self.render_manifest()
                continue

            selected_opt = next((o for o in options if o['id'] == raw_input), None)
            if selected_opt:
                break
            else:
                print(f"{HUD.YELLOW}Invalid command. Re-routing...{HUD.RESET}")
                time.sleep(1)

        # 6. Adjudication
        success = adjudicate_choice(effective, selected_opt.get('threshold', 0.0))

        # 6. Processing Result (Stylized Outcome Narrative)
        HUD.divider("CONSULTING THE VOID BARD")
        for _ in range(3):
            print(f"{HUD.DIM}.{HUD.RESET}", end="", flush=True)
            time.sleep(0.5)
        print(f"\n{HUD.DIM}The Bard of the Void has tuned his lyre...{HUD.RESET}\n")

        outcome_text = self.gm.describe_outcome(scenario, self.state.player_name, raw_input, success)

        if success:
            gain = scenario.get('dominance_gain', 2.0)
            self.state.current_planet_progress += gain
            HUD.divider("THE BARDIC ANTHEM")
            print(f"{HUD.GREEN}{outcome_text}{HUD.RESET}")
            print(f"{HUD.CYAN}Planet Domination Increased: +{gain:.1f}%{HUD.RESET}")

            # Item Discovery
            item_data = scenario.get('potential_item')
            if item_data:
                new_item = Item(**item_data)
                self.state.items.append(new_item)
                print(f"\n{HUD.BOLD}{HUD.YELLOW}[DISCOVERY]: {new_item.name} acquired!{HUD.RESET}")
        else:
            penalty = scenario.get('failure_penalty', 5.0)
            HUD.divider("THE BARD'S PLEA")
            print(f"{HUD.RED}{outcome_text}{HUD.RESET}")
            print(f"{HUD.RED}Domination Loss: -{penalty:.1f}%{HUD.RESET}")

            # Item Damage
            if self.state.items:
                damaged = self.state.items[0]
                damaged.durability -= 25
                if damaged.durability <= 0:
                    print(f"{HUD.RED}[LOSS]: {damaged.name} was destroyed in the failure.{HUD.RESET}")
                    self.state.items.pop(0)
                else:
                    print(f"\n{HUD.YELLOW}[DAMAGE]: {damaged.name} durability dropped to {damaged.durability}%.{HUD.RESET}")

            # Career Impact
            self.state.domination_percent -= penalty
            if self.state.domination_percent <= 0:
                print(f"\n{HUD.BOLD}{HUD.RED}THE RACE HAS FALLEN. REBIRTH INITIATED.{HUD.RESET}")
                trigger_restart(self.state)
                time.sleep(3)

        # 7. Planet Conclusion
        if self.state.current_planet_progress >= 100.0:
            HUD.divider("WORLD DOMINATED")
            print(f"{HUD.BOLD}{HUD.GREEN}PLANET {self.state.current_planet_name.upper()} HAS FALLEN.{HUD.RESET}")
            update_domination(self.state, True) # Career Update

            # Mutation Screen
            query = self.gm.scientist_query()
            print(f"\n{HUD.CYAN}[{query['speaker']}]{HUD.RESET}: {query['message']}")
            if input(f"{HUD.DIM}(y/N): {HUD.RESET}").lower() == 'y':
                self.mutation_screen()

            # Reset Target
            self.state.current_planet_name = None
            self.state.current_planet_progress = 0.0

        # 8. Persist
        self.persistence.save_state(
            self.state.to_dict(),
            self.state.current_planet_name or "VOID",
            "PROGRESS" if success else "RETREAT"
        )
        input("\nPress Enter to continue...")

def main() -> None:
    parser = argparse.ArgumentParser(description="Corvus Star: The Odin Protocol")
    parser.add_argument("--stats", action="store_true", help="Display genetic manifest")
    args = parser.parse_args()

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    game = OdinAdventure(project_root)

    if args.stats:
        game.render_manifest()
        sys.exit(0)

    HUD.divider("AWAKENING ODIN")
    print(f"\n{HUD.BOLD}{HUD.CYAN}Hi. Would you like to play a game?{HUD.RESET}")
    time.sleep(1)

    while True:
        os.system('cls' if os.name == 'nt' else 'clear')
        game.render_manifest()
        game.play_turn()

if __name__ == "__main__":
    main()
