# The Taliesin Bridge - Implementation Guide for Gemma 4 & TypeScript

This document outlines the exact technical implementation for connecting the custom TypeScript JRPG engine to a local Gemma 4 instance running the Taliesin v3.0 Phoenix Loop.

This guide is written for a rapid implementation model (like Gemini 2.5 Flash) to execute.

## 1. Architecture Overview
The game engine (TypeScript) acts as the **Client**.
The local LLM runner (e.g., Ollama running Gemma 4, or a custom Python FastAPI server) acts as the **Host**.

**The Goal:** The game engine must send a structured state payload (Party, Inventory, Location, Intent). The Host must run the Phoenix Loop internally and return a strict JSON response containing the dialogue, speaker, and UI triggers (e.g., portrait emotions).

## 2. Step 1: The Local Python API (The Host)
Do not try to run the raw LLM directly inside the browser/TypeScript game loop.
**Instruction:** Build a lightweight Python `FastAPI` server that wraps the local Gemma 4 model.

### Requirements for the Python Server:
1.  **Endpoint:** `POST /generate_dialogue`
2.  **Input Schema (Pydantic):**
    ```python
    class GameState(BaseModel):
        active_party: list[str] # e.g., ["John", "Gideon", "Nicci"]
        location: str # e.g., "The Woods (Night)"
        inventory: list[str] # e.g., ["Pillowcase of Candy", "Vampire Cloak"]
        intent: str # e.g., "Gideon complains about being hungry. Alfred finds a road."
    ```
3.  **The Phoenix Loop Implementation:**
    -   The server must load the `CORE_RULES.md`, `ANTI_FILLER.md`, and the `Story Bible` ledgers for the `active_party` members.
    -   It must prompt Gemma 4 to generate the dialogue based on the `intent`, enforcing the rules.
    -   **CRITICAL:** The prompt must explicitly force Gemma 4 to output *only* valid JSON.
4.  **Output Schema:**
    ```json
    {
      "dialogue_events": [
        {
          "speaker": "Gideon",
          "text": "I am wasting away Al, soon there will be nothing left of me!",
          "emotion": "complaining",
          "action": "pokes_stomach"
        },
        {
          "speaker": "Alfred",
          "text": "Some White Spot would be great right now.",
          "emotion": "weary",
          "action": "rolls_eyes"
        }
      ]
    }
    ```

## 3. Step 2: The TypeScript Client (The Engine)
The game engine needs an asynchronous manager to handle the bridge without freezing the game loop (60 FPS).

### Requirements for the TypeScript Bridge:
1.  **The `TaliesinManager` Class:**
    -   Create a class responsible for fetching dialogue.
    -   It must serialize the current game state from the ECS (Entity-Component-System) into the required JSON payload.
2.  **Asynchronous Execution:**
    -   When a player triggers an event (e.g., interacts with an object, or a cutscene starts), the engine must display a non-blocking "Loading..." or "Thinking..." UI element (like a subtle ellipsis animation in the dialogue box).
    -   Use `fetch()` to call the local Python API: `http://localhost:8000/generate_dialogue`.
    -   `await` the response.
3.  **Parsing & Rendering:**
    -   Parse the returned JSON `dialogue_events` array.
    -   Pass the array to the `UIManager` to render the text box character by character (the classic JRPG text crawl).
    -   Use the `emotion` field to select the correct pixel-art portrait for the speaker.
    -   Use the `action` field to trigger sprite animations (e.g., if action is "rolls_eyes", trigger Alfred's sigh animation).

## 4. Prompt Engineering for Structured Output (Gemma 4)
Getting local models to reliably output JSON without markdown wrapping or conversational filler requires a specific system prompt.

**Instruction:** Use the following system prompt structure in the Python server:
```text
You are TALIESIN, the dynamic narrator for a 16-bit JRPG.
You must strictly obey the CORE RULES and ANTI-FILLER constraints.
You must write dialogue for the Active Party based on their Character Ledgers.
The party ONLY has access to the provided Inventory. Do not invent items.

You MUST respond ONLY with a valid JSON object matching this schema:
{
  "dialogue_events": [
    {"speaker": "Name", "text": "Dialogue here", "emotion": "idle|angry|sad|happy", "action": "none|animation_name"}
  ]
}
Do not include markdown formatting like ```json. Output raw JSON only.
```