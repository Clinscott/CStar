# Fallows Hallow: Art & Scene Direction Spec
**Status:** Phase 1 (Draft)
**Lead Architect Persona:** NOMURA / KOJIMA

## 1. Visual Identity (16-Bit JRPG)
The game utilizes a strict 16-bit aesthetic (SNES era, FFVI), but leverages modern WebGL (PixiJS) for advanced lighting, particle effects, and post-processing.

*   **Color Palette:** Deep, rich colors. The "Mundane" world is warm (golds, oranges, browns). The "Old World" is cold and oppressive (purples, deep greens, obsidian blacks).
*   **Character Sprites:** 32x32 or 16x32 pixel art. Highly expressive idle animations (e.g., Spence twitching, Alfred adjusting glasses).
*   **UI Design (Liquid Glass):** Menus are high-contrast, semi-transparent black boxes with neon/magical accents that change color based on the character's dominant "Lagi Tapestry" pigment.

## 2. Scene Flow & The Taliesin System
How a typical scene plays out in the engine, blending hardcoded rails with AI-generated flavor.

### The Scene Structure:
1.  **The Trigger:** The player enters a new map node (e.g., The Deep Woods).
2.  **The Canonical Rail:** The engine locks player movement. A hardcoded script moves the sprites into position (e.g., John steps forward, looking around).
3.  **The AI Pulse:** The engine silently sends the `GameState` (Location: Deep Woods, Party: John, Gideon, Alfred) to the local Gemma 4 / Taliesin bridge.
4.  **The Dynamic Delivery:** Taliesin returns the dialogue JSON.
5.  **The Rendering:** The JRPG text box appears.
    *   *Portrait:* Displays the character's face, matching the `emotion` tag from the JSON (e.g., Alfred looks anxious).
    *   *Text Crawl:* The classic "blip-blip-blip" typing effect.
    *   *Sprite Action:* If the JSON includes an `action` tag (e.g., "shivers"), the sprite plays that specific animation.

### Example Scene (Dynamic Generation):
*   **Hardcoded Intent:** The party realizes they are lost in the woods and need to find food.
*   **Taliesin Output (If party is John, Gideon, Alfred):**
    *   *Gideon (Angry):* "I didn't survive the pits to starve out here. I'm hunting." (Sprite paces).
    *   *Alfred (Anxious):* "The probability of finding edible flora is... low. We should maintain formation." (Sprite adjusts glasses).
    *   *John (Determined):* "Stay close. My sight shows movement ahead. Be ready."
*   **Taliesin Output (If party is John, Nicci, Twins):**
    *   *Nicci (Calm):* "The roots here are old. They remember the blood. I can ask the earth for sustenance." (Sprite kneels).
    *   *The Twins (Synchronized):* "We hear the pulse of it. It's safe." (Sprites mirror each other).

## 3. Combat Spectacle
*   **The ATB Timeline:** A highly visible bar at the top of the screen showing turn order. This is crucial for John's Temporal mechanics.
*   **Lagi Forging VFX:** When a high-tier spell is cast, the screen dims (Mode-7 style background shift). A massive, programmatic particle effect (not a hand-drawn sprite animation) floods the screen, representing the color of the sacrificed memory pigment (e.g., a massive red fiery explosion for sacrificing a "Passion" memory).
*   **The Full Circle Link:** When characters execute a combo attack, a literal glowing thread (vector line drawn via PixiJS) connects their sprites before the strike lands.