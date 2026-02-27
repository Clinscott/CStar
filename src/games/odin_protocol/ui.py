import os
import time

from rich.console import Console

from src.core.sovereign_hud import SovereignHUD
from src.games.odin_protocol.engine import (
    calculate_effective_stats,
    get_combat_rating,
)

console = Console()

class OdinUI:
    @staticmethod
    def render_manifest(game, scenario=None) -> None:
        """Displays the player's genetic stats and empire status (Retro-Battle Grid style)."""
        modifiers = scenario.get("world_modifiers", []) if scenario else []
        effective = calculate_effective_stats(game.state.inventory, game.state.items, world_modifiers=modifiers)
        rating = get_combat_rating(effective)

        os.system('cls' if os.name == 'nt' else 'clear')
        print(f"{SovereignHUD.GREEN}[ WAR_ROOM - PLANETARY GRID ]-------------------[ v2.0.44 ]{SovereignHUD.RESET}")
        print("-----------------------------------------------------------")

        grid_labels = "   A    B    C    D    E    F    |  LEGEND"
        print(SovereignHUD.BOLD + grid_labels + SovereignHUD.RESET)

        legend = ["(X) Hive City", "(!) Siege Active", "(#) Resource Node", "(O) Warlord Drop"]

        for row in range(1, 5):
            row_str = f"{row} "
            for col in range(6):
                char = " "
                if row == 2 and col == 2 and game.state.current_planet_name: char = "!"
                if row == 1 and col == 1: char = "X"
                if row == 3 and col == 0: char = "#"
                if row == 4 and col == 3: char = "O"
                row_str += f"[{SovereignHUD.CYAN}{char}{SovereignHUD.RESET}]  "
            row_str += f"|  {legend[row-1]}"
            print(row_str)

        print("-----------------------------------------------------------")
        print(f" WARLORD              : {SovereignHUD.BOLD}{game.state.player_name}{SovereignHUD.RESET}")

        f_color = SovereignHUD.GREEN if game.state.force > 30 else SovereignHUD.RED
        print(f" FORCE DEPLOYED       : {f_color}{game.state.force:.1f}%{SovereignHUD.RESET}")

        if game.state.planets_dominated > 0:
            print(f" PLANETS CONQUERED    : {SovereignHUD.CYAN}{game.state.planets_dominated}{SovereignHUD.RESET}")

        if game.state.mutation_charges > 0:
            print(f" MUTATION CAPACITY    : {SovereignHUD.GREEN}{game.state.mutation_charges}{SovereignHUD.RESET}")

        print(f" COMBAT RATING        : {SovereignHUD.BOLD}{rating:.2f}{SovereignHUD.RESET}")

        if game.state.current_planet_name:
            print(f" SIEGE TARGET         : {SovereignHUD.CYAN}{game.state.current_planet_name.upper()}{SovereignHUD.RESET}")
            print(f" DOMINATION %         : {SovereignHUD.GREEN}{game.state.current_planet_progress:.1f}%{SovereignHUD.RESET}")

        nodes = game.state.nodal_progress
        n_str = (f" [X] HIVE: {nodes['HIVE']:.0f}% | [!] SIEGE: {nodes['SIEGE']:.0f}% | "
                 f"[#] RES: {nodes['RESOURCE']:.0f}% | [O] DROP: {nodes['DROP']:.0f}%")
        print(f" NODAL COVERAGE       :{SovereignHUD.YELLOW}{n_str}{SovereignHUD.RESET}")
        print("-----------------------------------------------------------")

    @staticmethod
    def briefing(game, scenario=None, persona="ODIN") -> None:
        """Strategic Briefing (Tone shifts based on Persona)."""
        turn = game.state.total_worlds_conquered + int(game.state.domination_percent)
        cooldown = 1

        if turn < game.state.last_briefing_turn + cooldown:
            remaining = (game.state.last_briefing_turn + cooldown) - turn
            p_name = SovereignHUD.PERSONA
            msg = "Re-calibrating void-optics" if p_name == "ALFRED" else "Focusing the All-Seeing Eye"
            print(f"\n{SovereignHUD.YELLOW}[{p_name}]: {msg}. Wait {remaining} turns.{SovereignHUD.RESET}")
            time.sleep(1)
            return

        os.system('cls' if os.name == 'nt' else 'clear')
        header = "| THE ADVISOR |" if SovereignHUD.PERSONA == "ALFRED" else "| THE ALL-FATHER |"
        color = SovereignHUD.CYAN if SovereignHUD.PERSONA == "ALFRED" else SovereignHUD.MAGENTA

        print(f"{SovereignHUD.BOLD}{color}{header} seed: {game.state.seed} | --------------------------{SovereignHUD.RESET}")
        print(f"\n  STATUS: Strategic Briefing for Warlord {game.state.player_name}")

        if scenario:
            lore_tag = "LORE  " if SovereignHUD.PERSONA == "ALFRED" else "MYTHOS"
            print(f"  {lore_tag}: {scenario.get('lore', 'Searching the annals...')}")
            print(f"  THREAT: {SovereignHUD.RED}{scenario.get('failure_penalty', 5.0)}/20 (Volatility Risk){SovereignHUD.RESET}")

        print(f"\n  {SovereignHUD.BOLD}:: GENE_STREAM ------------------------------------------{SovereignHUD.RESET}")
        modifiers = scenario.get("world_modifiers", []) if scenario else []
        effective = calculate_effective_stats(game.state.inventory, game.state.items, world_modifiers=modifiers)

        sorted_dna = sorted(game.state.inventory.items(), key=lambda x: effective[x[0]], reverse=True)
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
        game.state.last_briefing_turn = turn
        input(f"\n{SovereignHUD.DIM}Press Enter to return to the command deck...{SovereignHUD.RESET}")
