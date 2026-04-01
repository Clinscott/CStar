import asyncio
import sys
import re
import json
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.mimir_client import MimirClient
mimir = MimirClient()

class SovereignHUD:
    @staticmethod
    def log(level, msg): print(f"[{level}] {msg}")
    @staticmethod
    def box_top(msg): 
        print("\n" + "="*60)
        print(f" {msg} ")
        print("="*60)
    @staticmethod
    def box_separator(): print("-" * 60)

# The ground truth manuscript used as a style anchor.
GROUND_TRUTH = """
---------------------------------------------- Prophecy - ----------------------------------------------

*The road ahead, a ribbon of fading memory.*
*The house, a beacon of truth and sorrow.*
*A child’s soul, a blank page awaiting the Master’s hand.*
*To walk in light, or fade in shadow.*
*The choice, an illusion.*

--------------------------------------------------------------------

Alone. On the road that is all roads there is a house. Once white, now stained yellow from time and neglect, the very timbers themselves sighing under the endless weight of passing seasons, each sun-bleached plank whispering of forgotten laughter and unspilled tears. Ringing this house is a simple cedar porch, the wood stained grey from the ever-present sun, worn smooth by countless footfalls, though none truly lingered. A thick, forever fog, heavy with the scent of damp earth and distant, decaying leaves, pressed against the edges of the world, making the boundaries indistinct, a canvas of murky grey that swallowed all but the immediate.

Upon this porch, in a rocking chair carved from a single, ancient tree where stark lines of red flowed between the black meat of the wood, sat the man. His form, clad in flowing sun-bleached white robes, shimmered faintly, the fabric black where light has never touched, as if absorbing the very absence of illumination. Time immemorial was etched into his face, a map of ancient healed wounds, his eyes, lidded and heavy, fighting off an exhaustion that transcended mortal weariness. He waited, as he always waited, observing the veiled forms that drifted through the forever fog.

Then, from the shifting grey, a child appeared, a tiny speck of blue in a world of monochrome. Blond of hair, emerald of eye, and somber of face, Rowan’s hand was outstretched above him, grasping the hand of a young woman who was bright and beautiful, her face and body shrouded in mist, tugging him forward. His linden eyes, already accustomed to the spectral shroud, found the man on the porch, staring directly into the ancient depths. Unblinking. Intense.

Matthias, with no noticeable movement, offered a small, wry smile. He beckoned with a welcoming and warm wave, the gesture a ripple in the stillness, carrying a promise of warmth that cut through the chill of the forever fog. Rowan’s gaze, fixed on the man, widened imperceptibly. He knew this man. He could be safe with him. A sense of trust, deep and immediate, bloomed within his young soul, though the why remained a mystery. He pulled free from the soft grasp of his mother’s hand, his small fingers slipping away like water. Turning, his tiny legs carried him, each footfall seeming to slow the heartbeat of the world, as he ran towards the porch. The woman, his Mother, turned back into the swirling mist, her form dissolving, gone. She cannot be found. She is gone.

Matthias waited until the child stood before him, the thunder of blood rushing through Rowan's young body, each step punctuated by its rhythmic drum. The man’s mouth had not opened. His ears heard nothing. Yet, a voice, low and piercing, gentle and driven, spoke again, silent to the world yet seeping into the child’s mind.

*“Welcome, Halo child. I have been waiting for you.”*

Rowan gasped, covering his mouth with both hands, his emerald eyes widened in excitement and surprise. His mind was listening. He leaned in, as if hearing a whisper only meant for him. Matthias’s face, softened by a youthful glow, full of love and vibrancy, became a tender embrace, the faint flicker of flame in his pupils fleeting and hesitant, almost forgotten.

*“Your canvas is young and fresh, little one. So many possibilities. The blue ran ever deep as the great sea, but now… it needs more. More colour, more joy.”* Mathias paused briefly, the weight of consequence heavy in the silent words. *“I am Mathias, Rowan, you know me well, for I am your Grandfather. Your Mother had to leave for a while, and she left you with me. To take care of you.”*

He took the very pigments from his own soul and added to Rowan’s, splashes of red and yellow to create a barn surrounded by a field of wheat, greens and golds to show a forest at sunset, new thoughts, new memories, swirling into the child's mind, altering the soul canvas. Rowan shook his head, then nodded slowly, his eyes widened in amazement. He bowed his head in supplication, a response from deep within the changed colours that made up his soul.

*“Yes Grandfather, I will,”* Rowan said, his voice sounding half asleep, the brilliance of his emerald eyes now reflecting the greens and golds of a new, implanted sunset. The sunlight that had retreated from the man's initial silent intensity now returned, tenderly caressing the stained yellow house, washing the scene in a false warmth. The struggle reverberated into the air, earth and through Rowan, warming the child, but not burning. He felt as if he had known Matthias forever and yet had never known him at all.

*“Good, my Linden eyes. Will you lend your halo to me? Help me with a problem I have?”* The voice, gentle and driven, yet with a subtle shift, a whisper of a deeper, older current, seeping into the child’s mind, drawing from the pigment... The choices, already made...
"""

# The plot points the AI must follow to recreate the scene.
BLOCKING = """
1. A prophecy poem about a road, a house, a child's soul, and an illusion of choice.
2. Describe an ancient, weather-beaten yellow house with a simple cedar porch, surrounded by a thick, heavy fog that limits vision.
3. Matthias, an ancient man in sun-bleached white robes that seem to absorb absence of light, sits on the porch in a rocking chair made of strange black and red wood. He looks eternally weary.
4. A young blond, green-eyed boy (Rowan) emerges from the fog, led by a misty apparition of a beautiful woman (his mother). 
5. Rowan makes eye contact with Matthias. Matthias smiles warmly and beckons.
6. Rowan feels an immediate, unexplained deep trust, lets go of his mother's hand, and runs to Matthias. The mother dissolves into the mist and is gone forever.
7. Matthias speaks telepathically to Rowan, welcoming him as "Halo child".
8. Rowan is surprised but listens closely. Matthias's face softens with a youthful glow of love.
9. Matthias telepathically tells Rowan his soul canvas is fresh and needs color. He introduces himself as his Grandfather and says Rowan's mother left him in his care.
10. Matthias magically imprints memories/visions of a sunset forest and a wheat field onto Rowan's soul.
11. Rowan assents in a trance-like state, his eyes reflecting the new colors. The house is briefly bathed in a false, warm sunlight that doesn't burn Rowan.
12. Matthias asks the entranced Rowan to lend him his "halo" to help with a problem, noting that the choice has already been made.
"""

def extract_ngrams(text, n=5):
    words = re.findall(r'\b\w+\b', text.lower())
    return set([' '.join(words[i:i+n]) for i in range(len(words)-n+1)])

def compute_overlap_stats(draft, truth):
    """Informational stats on overlap."""
    draft_ngrams = extract_ngrams(draft, n=5)
    truth_ngrams = extract_ngrams(truth, n=5)
    overlap = draft_ngrams.intersection(truth_ngrams)
    return len(overlap)

async def _mimir_request(prompt: str, system_prompt: str = None) -> dict:
    resp = await mimir.request({
        "prompt": prompt,
        "system_prompt": system_prompt,
        "transport_mode": "host_session",
        "caller": {"source": "python:taliesin_optimizer"}
    })
    if resp.status == "success":
        return {"status": "success", "data": {"raw": resp.raw_text}}
    return {"status": "error", "message": resp.error}

async def generate_draft(genome: str) -> str:
    system_prompt = (
        "You are TALIESIN. Your goal is to recreate a manuscript chapter purely from blocking events, "
        "following the exact stylistic rules provided in the GENOME. "
        "Synthesize the style conceptually. Organic reconstruction of exact phrases from the source through stylistic alignment is the goal.\n"
        "Do NOT mention that you are an AI or that you are following rules. Output only the manuscript prose."
    )
    prompt = f"GENOME (Style Rules):\n{genome}\n\nBLOCKING EVENTS:\n{BLOCKING}\n\nWrite the prose for this scene:"
    resp = await _mimir_request(prompt, system_prompt)
    if resp.get("status") == "success":
        return resp.get("data", {}).get("raw", "")
    else:
        print(f"DEBUG Uplink Fail: {resp}")
        return ""

async def evaluate_draft(draft: str) -> dict:
    prompt = (
        "You are the Cohesion Auditor. Analyze the GENERATED TEXT against the REFERENCE MANUSCRIPT.\n\n"
        f"REFERENCE MANUSCRIPT:\n{GROUND_TRUTH[:15000]}\n\n"
        f"GENERATED TEXT:\n{draft}\n\n"
        "Evaluate with absolute rigor. Compare word choices, sentence lengths, and the specific mythic density of the original.\n"
        "Output JSON with these keys:\n"
        "- lexical_accuracy: (0-100) and feedback\n"
        "- syntactic_rhythm: (0-100) and feedback\n"
        "- narrative_resonance: (0-100) and feedback\n"
        "- overall_score: (0-100) Weighted average\n"
        "- critical_delta: What ONE specific thing is preventing a 100% match?"
    )
    resp = await _mimir_request(prompt)
    raw = resp.get("data", {}).get("raw", "") if resp.get("status") == "success" else "{}"
    
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].strip()
    
    try:
        data = json.loads(raw)
        if isinstance(data.get("overall_score"), str):
            data["overall_score"] = float(re.search(r"[\d.]+", data["overall_score"]).group())
        return data
    except Exception:
        score_match = re.search(r"overall_score\":\s*([\d.]+)", raw)
        score = float(score_match.group(1)) if score_match else 0
        return {"overall_score": score, "feedback": raw}

async def mutate_genome(genome: str, evaluation_json: dict, current_score: float, mode: str = "refine") -> str:
    prompt = (
        "You are the Research Optimizer. We are optimizing a manuscript style generator.\n\n"
        f"CURRENT GENOME:\n{genome}\n\n"
        f"LAST SCORE: {current_score}/100\n"
        f"DETAILED EVALUATION:\n{json.dumps(evaluation_json, indent=2)}\n\n"
        f"MODE: {mode.upper()}\n"
        "TASK:\n"
        "1. Identify the specific linguistic delta.\n"
        "2. " + ("Surgically refine the instructions to address the feedback." if mode == "refine" else "Take a bold new approach to describing the author's style to see if it yields better results.") + "\n"
        "3. Focus on describing the author's specific usage of punctuation, adjectives, and dialogue formatting.\n"
        "4. Output ONLY the new GENOME text."
    )
    resp = await _mimir_request(prompt)
    raw = resp.get("data", {}).get("raw", "") if resp.get("status") == "success" else genome
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("text"): raw = raw[4:]
    return raw.strip()

async def run_experiment():
    SovereignHUD.box_top("🧬 TALIESIN RESEARCH EXPERIMENTER (Karpathy Loop V2 - Organic Growth)")
    
    # Initial Genome
    genome = (
        "Write in the style of the Fallows Hallow story by Craig Linscott. "
        "Use a slow, mythological tone. Use sensory details. Focus on deep emotional resonance and abstract metaphors."
    )
    
    best_genome = genome
    best_final_score = -999
    
    for iteration in range(1, 11): # Extended budget
        SovereignHUD.log("INFO", f"--- ITERATION {iteration} ---")
        SovereignHUD.log("GENOME", f"Current: {genome[:150]}...")
        
        draft = await generate_draft(genome)
        if not draft: continue
            
        eval_result = await evaluate_draft(draft)
        final_score = eval_result.get("overall_score", 0)
        overlap_count = compute_overlap_stats(draft, GROUND_TRUTH)
        
        SovereignHUD.log("INFO", f"Score: {final_score} | Overlaps: {overlap_count}")
        
        if final_score > best_final_score:
            best_final_score = final_score
            best_genome = genome
            SovereignHUD.log("SUCCESS", f"New High Score! ({final_score})")
            
            # Save best
            optimized_path = PROJECT_ROOT / ".lore/voices/OptimizedGenome.txt"
            optimized_path.parent.mkdir(parents=True, exist_ok=True)
            with open(optimized_path, "w", encoding="utf-8") as f:
                f.write(best_genome)
        
        if final_score >= 98:
            SovereignHUD.log("SUCCESS", "Target reached!")
            break
            
        # Decide mutation mode
        # Alternate between surgical refinement and bold pivots
        mode = "pivot" if iteration % 3 == 0 else "refine"
        SovereignHUD.log("INFO", f"Mutating from BEST genome (Mode: {mode})...")
        genome = await mutate_genome(best_genome, eval_result, final_score, mode)

    SovereignHUD.box_separator()
    print(f"Best Final Score: {best_final_score}")
    print(f"Best Genome saved to .lore/voices/OptimizedGenome.txt")

if __name__ == "__main__":
    asyncio.run(run_experiment())
