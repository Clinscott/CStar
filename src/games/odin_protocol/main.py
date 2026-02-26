import os
import sys
import json
import time
import random
import subprocess
from pathlib import Path

# Fix: Ensure subprocess/random are available for CI
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
)

# [ALFRED] Importing the Corvus Star UI Backbone
_core_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "core")
sys.path.insert(0, _core_dir)
from src.core.sovereign_hud import SovereignHUD

class OdinAdventure:
    """The central coordinator for the Odin Protocol Game Loop."""

    def __init__(self, project_root: str) -> None:
        self.project_root = project_root
        self.persistence = OdinPersistence(project_root)
        self.gm = OdinGM()
        self.state = self._init_state()

        # UI Setup
        config_path = os.path.join(project_root, "config.json")
        default_persona = "ALFRED"
        if os.path.exists(config_path):
            with open(config_path) as f:
                config = json.load(f)
                default_persona = (config.get("persona") or config.get("Persona") or "ALFRED").upper()

        SovereignHUD.PERSONA = self.state.active_persona or default_persona

        # Prompt for name if this is a fresh start or default
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
                planets_dominated=saved.get("planets_dominated", 0),
                mutation_charges=saved.get("mutation_charges", 0),
                total_turns_played=saved.get("total_turns_played", 0),
                force=saved.get("force", 100.0),
                current_planet_name=saved.get("current_planet_name"),
                current_planet_progress=saved.get("current_planet_progress", 0.0),
                nodal_progress=saved.get("nodal_progress", {"HIVE": 0.0, "SIEGE": 0.0, "RESOURCE": 0.0, "DROP": 0.0}),
                ticker_velocity=saved.get("ticker_velocity", 0.0),
                momentum_turns=saved.get("momentum_turns", 0),
                last_briefing_turn=saved.get("last_briefing_turn", -5),
                active_persona=saved.get("active_persona", "ALFRED"),
                active_campaigns=saved.get("active_campaigns", {}),
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

    def render_manifest(self, scenario: dict = None) -> None:
        """Displays the player's genetic stats and empire status (Retro-Battle Grid style)."""
        # Pass world modifiers to stats calculation if available
        modifiers = scenario.get("world_modifiers", []) if scenario else []
        effective = calculate_effective_stats(self.state.inventory, self.state.items, world_modifiers=modifiers)
        rating = get_combat_rating(effective)

        # War Room Proposal: Retro-Battle Grid
        os.system('cls' if os.name == 'nt' else 'clear')
        print(f"{SovereignHUD.GREEN}[ WAR_ROOM - PLANETARY GRID ]-------------------[ v2.0.44 ]{SovereignHUD.RESET}")
        print("-----------------------------------------------------------")

        # Draw a 4x6 grid with SIDE-LEGEND
        grid_labels = "   A    B    C    D    E    F    |  LEGEND"
        print(SovereignHUD.BOLD + grid_labels + SovereignHUD.RESET)

        legend = [
            "(X) Hive City",
            "(!) Siege Active",
            "(#) Resource Node",
            "(O) Warlord Drop"
        ]

        for row in range(1, 5):
            row_str = f"{row} "
            for col in range(6):
                char = " "
                if row == 2 and col == 2 and self.state.current_planet_name: char = "!"
                if row == 1 and col == 1: char = "X"
                if row == 3 and col == 0: char = "#"
                if row == 4 and col == 3: char = "O"
                row_str += f"[{SovereignHUD.CYAN}{char}{SovereignHUD.RESET}]  "

            # Add legend entry
            row_str += f"|  {legend[row-1]}"
            print(row_str)

        print("-----------------------------------------------------------")
        # Status Plate (Non-Boxed for cleaner aesthetic)
        print(f" WARLORD              : {SovereignHUD.BOLD}{self.state.player_name}{SovereignHUD.RESET}")

        # Phase 9: Force Resource
        f_color = SovereignHUD.GREEN if self.state.force > 30 else SovereignHUD.RED
        print(f" FORCE DEPLOYED       : {f_color}{self.state.force:.1f}%{SovereignHUD.RESET}")

        if self.state.planets_dominated > 0:
            print(f" PLANETS CONQUERED    : {SovereignHUD.CYAN}{self.state.planets_dominated}{SovereignHUD.RESET}")

        if self.state.mutation_charges > 0:
            print(f" MUTATION CAPACITY    : {SovereignHUD.GREEN}{self.state.mutation_charges}{SovereignHUD.RESET}")

        print(f" COMBAT RATING        : {SovereignHUD.BOLD}{rating:.2f}{SovereignHUD.RESET}")

        if self.state.current_planet_name:
            print(f" SIEGE TARGET         : {SovereignHUD.CYAN}{self.state.current_planet_name.upper()}{SovereignHUD.RESET}")
            print(f" DOMINATION %         : {SovereignHUD.GREEN}{self.state.current_planet_progress:.1f}%{SovereignHUD.RESET}")

        # Phase 9: Nodal Coverage
        nodes = self.state.nodal_progress
        n_str = (f" [X] HIVE: {nodes['HIVE']:.0f}% | [!] SIEGE: {nodes['SIEGE']:.0f}% | "
                 f"[#] RES: {nodes['RESOURCE']:.0f}% | [O] DROP: {nodes['DROP']:.0f}%")
        print(f" NODAL COVERAGE       :{SovereignHUD.YELLOW}{n_str}{SovereignHUD.RESET}")

        print("-----------------------------------------------------------")

    def briefing(self, scenario: dict = None) -> None:
        """Strategic Briefing (Tone shifts based on Persona)."""
        turn = self.state.total_worlds_conquered + int(self.state.domination_percent)
        cooldown = 1

        if turn < self.state.last_briefing_turn + cooldown:
            remaining = (self.state.last_briefing_turn + cooldown) - turn
            p_name = SovereignHUD.PERSONA
            msg = "Re-calibrating void-optics" if p_name == "ALFRED" else "Focusing the All-Seeing Eye"
            print(f"\n{SovereignHUD.YELLOW}[{p_name}]: {msg}. Wait {remaining} turns.{SovereignHUD.RESET}")
            time.sleep(1)
            return

        os.system('cls' if os.name == 'nt' else 'clear')

        # UI Header shifts by Persona
        header = "| THE ADVISOR |" if SovereignHUD.PERSONA == "ALFRED" else "| THE ALL-FATHER |"
        color = SovereignHUD.CYAN if SovereignHUD.PERSONA == "ALFRED" else SovereignHUD.MAGENTA

        print(f"{SovereignHUD.BOLD}{color}{header} seed: {self.state.seed} | --------------------------{SovereignHUD.RESET}")
        print(f"\n  STATUS: Strategic Briefing for Warlord {self.state.player_name}")

        if scenario:
            lore_tag = "LORE  " if SovereignHUD.PERSONA == "ALFRED" else "MYTHOS"
            print(f"  {lore_tag}: {scenario.get('lore', 'Searching the annals...')}")
            print(f"  THREAT: {SovereignHUD.RED}{scenario.get('failure_penalty', 5.0)}/20 (Volatility Risk){SovereignHUD.RESET}")

        print(f"\n  {SovereignHUD.BOLD}:: GENE_STREAM ------------------------------------------{SovereignHUD.RESET}")

        # Recalculate with modifiers
        modifiers = scenario.get("world_modifiers", []) if scenario else []
        effective = calculate_effective_stats(self.state.inventory, self.state.items, world_modifiers=modifiers)

        sorted_dna = sorted(self.state.inventory.items(), key=lambda x: effective[x[0]], reverse=True)
        for cid, chromosome in sorted_dna[:5]:
            eff = effective[cid]
            bar = SovereignHUD.progress_bar(min(100, int(eff * 10)))
            print(f"  {chromosome.name:15} {bar} {eff:.1f}")

        print(f"\n  {SovereignHUD.BOLD}:: FEED{SovereignHUD.RESET}")
        if scenario:
            if SovereignHUD.PERSONA == "ALFRED":
                print(f"  [ALFRED]: \"The {scenario.get('sediment', 'ground')} seems stable, but the {scenario.get('fauna', 'creatures')} are restless.\"")
            else:
                print(f"  [ODIN]: \"The {scenario.get('sediment', 'earth')} quakes at your step. The {scenario.get('fauna', 'beasts')} sense their master.\"")
        else:
            msg = "\"The spiral holds, Master. Our genetics are evolving beautifully.\"" if SovereignHUD.PERSONA == "ALFRED" else "\"The cosmic tapestry weaves in your favor, King of Gods.\""
            print(f"  [{SovereignHUD.PERSONA}]: {msg}")

        print("-----------------------------------------------------------")
        self.state.last_briefing_turn = turn
        input(f"\n{SovereignHUD.DIM}Press Enter to return to the command deck...{SovereignHUD.RESET}")

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
            # 1. git stash
            subprocess.run(["git", "stash"], cwd=self.project_root, capture_output=True)

            # 2. git log
            log = subprocess.check_output(
                ["git", "log", "--oneline", "-n", "5"],
                cwd=self.project_root
            ).decode("utf-8")

            print(f"\n{SovereignHUD.BOLD}Available Temporal Anchors:{SovereignHUD.RESET}")
            print(log)

            target = input(f"\n{SovereignHUD.CYAN}>> Enter Git Hash to breach into (or 'c' to cancel): {SovereignHUD.RESET}").strip()
            if target.lower() == 'c': return

            # 3. git checkout save_state
            # Assuming persistence handles save_state.json
            save_path = os.path.join(self.project_root, "odin_protocol", "save_state.json")
            res = subprocess.run(["git", "checkout", target, "--", "odin_protocol/save_state.json"], cwd=self.project_root)

            if res.returncode == 0:
                print(f"{SovereignHUD.GREEN}Anchor Established. Reloading State...{SovereignHUD.RESET}")
                self.state = self._init_state() # Reload

                # 4. Apply Timeline Corruption (Genetic Decay)
                # Randomly damage 1 chromosome.
                cid = random.choice(list(self.state.inventory.keys()))
                old_lvl = self.state.inventory[cid].level
                self.state.inventory[cid].level = max(1, old_lvl - 2)
                print(f"{SovereignHUD.RED}[CORRUPTION]: {cid} level dropped from {old_lvl} to {self.state.inventory[cid].level}.{SovereignHUD.RESET}")

                # 5. Commit Breach
                subprocess.run(["git", "add", "odin_protocol/save_state.json"], cwd=self.project_root)
                subprocess.run(["git", "commit", "-m", f"TEMPORAL_BREACH: {target}"], cwd=self.project_root)
                time.sleep(2)
            else:
                print(f"{SovereignHUD.RED}Failed to reach anchor. Timeline remains intact.{SovereignHUD.RESET}")

        except Exception as e:
            print(f"{SovereignHUD.RED}Breach Error: {e}{SovereignHUD.RESET}")

        input("\nPress Enter to return to the bridge...")

    def _apply_passive_ticker(self, affinity_score: float) -> None:
        """Applies passive domination growth/decay based on Genetic Affinity and Momentum."""
        # Baseline velocity from affinity
        velocity = affinity_score

        # Momentum Buff / Resurgence Penalty
        if self.state.momentum_turns > 0:
            velocity *= 1.5
            self.state.momentum_turns -= 1
        elif self.state.momentum_turns < 0:
            velocity *= 0.5 # stalled
            self.state.momentum_turns += 1

        # Update state
        self.state.ticker_velocity = velocity
        self.state.current_planet_progress += velocity

        # Clamp
        self.state.current_planet_progress = max(0.0, min(100.0, self.state.current_planet_progress))
        self.state.domination_percent = self.state.current_planet_progress # Sync

    def play_turn(self) -> None:
        """Executes the strategic War Room loop or a tactical nodal campaign."""

        turn_id = self.state.total_turns_played
        planet_name = self.state.current_planet_name
        campaign = self.state.active_campaigns.get(planet_name) if planet_name else None

        # 1. Strategic Phase: War Room Selection
        target_node = self.state.active_node

        if not target_node:
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

            # Protocol Handling
            if cmd == 'Q': sys.exit(0)
            if cmd == 'P':
                SovereignHUD.PERSONA = "ODIN" if SovereignHUD.PERSONA == "ALFRED" else "ALFRED"
                self.state.active_persona = SovereignHUD.PERSONA
                return
            if cmd == 'M':
                effective = calculate_effective_stats(self.state.inventory, self.state.items)
                self.show_genetic_manifest(effective)
                input("\nPress Enter to return to the bridge...")
                return

            # Nodal Mapping
            node_map = {'X': 'HIVE', '!': 'SIEGE', '#': 'RESOURCE', 'O': 'DROP'}
            if cmd not in node_map:
                print(f"{SovereignHUD.RED}Invalid Node Identifier.{SovereignHUD.RESET}")
                time.sleep(1)
                return

            target_node = node_map[cmd]
            self.state.active_node = target_node
            SovereignHUD.divider("WAR ROOM: LOCKING IN")
            print(f"{SovereignHUD.CYAN}Nodal Campaign identified. Forces deployed to {target_node}.{SovereignHUD.RESET}")
            time.sleep(1)

        # 3. Scenario Generation (Brutal/Nodal)
        effective = calculate_effective_stats(self.state.inventory, self.state.items)
        scenario = self.gm.generate_scenario(
            stats=effective,
            seed=self.state.seed,
            turn_id=turn_id,
            player_name=self.state.player_name,
            campaign_data=campaign,
            node_type=target_node
        )

        # Apply Passive Ticker before the encounter
        self._apply_passive_ticker(scenario.get('affinity_score', 0.1))

        # 4. Update State with new Campaign Data
        new_planet_name = scenario['planet_name']
        self.state.current_planet_name = new_planet_name
        self.state.active_campaigns[new_planet_name] = scenario['campaign_state']

        # 5. PHASE II: THE TACTICAL ENCOUNTER
        self.render_manifest(scenario)
        SovereignHUD.divider(f"TACTICAL BREACH: {target_node}")
        print(f"\n{SovereignHUD.CYAN}{scenario['lore']}{SovereignHUD.RESET}")

        p = scenario['active_persona']
        print(f"\n{SovereignHUD.BOLD}{p['rank']} {p['name']} REPORT:{SovereignHUD.RESET}")
        print(f"{SovereignHUD.YELLOW}\"{scenario['conflict']}\"{SovereignHUD.RESET}")

        # Decision Loop (Refined for Nodal Victory)
        while True:
            SovereignHUD.divider(f"COMMAND DECK: {target_node}")
            print(f"\n{SovereignHUD.BOLD}{scenario['immediate_question']}{SovereignHUD.RESET}")

            options = scenario.get('options', [])
            for opt in options:
                diff = opt.get('difficulty', 'Unknown')
                color = SovereignHUD.CYAN
                if diff == 'Easy' or diff == 'Trivial': color = SovereignHUD.GREEN
                elif diff == 'Hard': color = SovereignHUD.YELLOW
                elif diff == 'Lethal': color = SovereignHUD.RED
                print(f" [{opt['id']}] {opt['text']:35} ({color}{diff}{SovereignHUD.RESET})")

            print(f" [R] Retreat & Regroup           ({SovereignHUD.YELLOW}Penalty: 50% Node Progress{SovereignHUD.RESET})")

            raw_input = input(f"\n{SovereignHUD.CYAN}>> Deployment Choice: {SovereignHUD.RESET}").upper().strip()

            if raw_input == 'R':
                print(f"\n{SovereignHUD.YELLOW}[RETREAT]: Forces withdrawing. Node progress halved.{SovereignHUD.RESET}")
                self.state.nodal_progress[target_node] *= 0.5
                self.state.active_node = None
                time.sleep(2)
                return

            # Adjudication
            choice = next((o for o in options if o['id'] == raw_input), None)
            if not choice: continue

            result = adjudicate_choice(self.state, choice, effective, scenario)

            # Weighted Feedback
            SovereignHUD.divider("DIE CAST RESULTS")
            print(f" {SovereignHUD.BOLD}CHANCE  :{SovereignHUD.RESET} {SovereignHUD.CYAN}{result['chance']*100:.1f}%{SovereignHUD.RESET}")
            print(f" {SovereignHUD.BOLD}ROLL    :{SovereignHUD.RESET} {SovereignHUD.YELLOW}{result['roll']*100:.1f}%{SovereignHUD.RESET}")

            # Phase 9: Nodal Progress Tracking
            if result['success']:
                print(f"\n{SovereignHUD.GREEN}[VICTORY]: Tactical objective secured.{SovereignHUD.RESET}")
                print(f" FORCE   : {SovereignHUD.YELLOW}{result['force_delta']:.1f}%{SovereignHUD.RESET} (Mitigated)")
                print(f" PROGRESS: {SovereignHUD.GREEN}+{result['dom_delta']:.1f}%{SovereignHUD.RESET}")

                gain = result['dom_delta']
                current = self.state.nodal_progress.get(target_node, 0.0)

                # Cap at 24%
                new_prog = min(24.0, current + gain)
                self.state.nodal_progress[target_node] = new_prog

                # Momentum
                self.state.momentum_turns = 3

                # Check for Node Completion
                if new_prog >= 24.0:
                    print(f"{SovereignHUD.MAGENTA}{SovereignHUD.BOLD}\n[NODE SECURED]: Campaign objective attained at {target_node}.{SovereignHUD.RESET}")
                    self.state.active_node = None

                # Check for Global Conquest
                ready_nodes = [v for k, v in self.state.nodal_progress.items() if v >= 24.0]
                total_dom = sum(self.state.nodal_progress.values())

                if len(ready_nodes) >= 3 and total_dom > 80.0:
                    print(f"\n{SovereignHUD.MAGENTA}{SovereignHUD.BOLD}[WORLD DOMINATION ATTAINED]{SovereignHUD.RESET}")
                    self.state.current_planet_progress = 100.0
            else:
                print(f"\n{SovereignHUD.RED}[DEFEAT]: Forces repelled. Resistance Resurgence triggered.{SovereignHUD.RESET}")
                print(f" FORCE   : {SovereignHUD.RED}{result['force_delta']:.1f}%{SovereignHUD.RESET}")
                print(f" PROGRESS: {SovereignHUD.RED}{result['dom_delta']:.1f}%{SovereignHUD.RESET}")

                if result['penalty_msg']:
                    print(f" {SovereignHUD.RED}[PENALTY]: {result['penalty_msg']}{SovereignHUD.RESET}")

                # Update Progress
                current = self.state.nodal_progress.get(target_node, 0.0)
                self.state.nodal_progress[target_node] = max(0.0, current + result['dom_delta'])

                self.state.momentum_turns = -3

            # Force Update
            self.state.force = max(0.0, min(100.0, self.state.force + result['force_delta']))

            # Check for Total Depletion
            if self.state.force <= 0:
                print(f"\n{SovereignHUD.RED}[TOTAL DEPLETION]: Forces broken. Campaign abandoned.{SovereignHUD.RESET}")
                self.state.active_node = None

            self.state.total_turns_played += 1
            self.persistence.save_state(self.state.to_dict(), new_planet_name, "Tactical Breach")
            input("\nPress Enter to return to the bridge...")
            break



        # Increment turn counter


    def show_genetic_manifest(self, effective: dict) -> None:
        """Dedicated screen for synergy matrix and genetic data."""
        os.system('cls' if os.name == 'nt' else 'clear')
        SovereignHUD.divider("GENETIC MANIFEST")
        SovereignHUD.box_top("SYNERGY MATRIX (INFINITE SPIRAL)")
        sorted_dna = sorted(self.state.inventory.items(), key=lambda x: effective[x[0]], reverse=True)
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
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    if project_root not in sys.path:
        sys.path.append(project_root)
        
    # Graceful Disconnect Check (Gungnir Calculus)
    try:
        from src.cstar.core.client import ping_daemon
        ping_daemon(timeout=1.0)
    except Exception as e:
        print(f"\n{SovereignHUD.RED}[SYSTEM FAILURE] Cortex Daemon Offline. ({e}){SovereignHUD.RESET}")
        print(f"{SovereignHUD.DIM}The Sovereign Engine must be running to engage the Odin Protocol.{SovereignHUD.RESET}")
        sys.exit(1)

    game = OdinAdventure(project_root)

    # Startup Sequence
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