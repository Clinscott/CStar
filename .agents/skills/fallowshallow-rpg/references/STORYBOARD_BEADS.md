# Fallows Hallow: Storyboard Beads (Narrative Ledger)
**Status:** In-Progress
**Lead Architect Persona:** TALIESIN

This document tracks the granular development of story beats ("Beads") from high-order concepts to the specific JSON payloads sent to the Taliesin Bridge.

---

## Current Bead Status

| Bead ID | Title | Act | Status | Description |
| :--- | :--- | :--- | :--- | :--- |
| BEAD-001 | The Haunted House Trap | Act I | **DRAFT** | The Halloween night intro where the breach occurs. |
| BEAD-002 | Spence's Sacrifice | Act I | **DRAFT** | The death of Spence and the group's capture. |
| BEAD-003 | The Arena (Gideon) | Act II | **PENDING** | Gideon's forced transformation into "The Beaut." |

---

## Bead Deep-Dives

### BEAD-001: The Haunted House Trap
- **Mood:** Nostalgic, Autumnal, Eerie.
- **Narrative Goal:** Transition the party from the mundane world to the Old World.
- **Key Dialogue Moments:** 
    - Gideon complaining about the cold.
    - Alfred sensing something "wrong" with the floorboards.
- **Taliesin Payload (Expected):**
    ```json
    {
      "location": "The Hallow House - Entrance",
      "party": ["John", "Gideon", "Alfred", "Nicci", "Twins"],
      "inventory": ["Pillowcase of Candy", "Flashlight (Weak)"],
      "intent": "The party enters the house. The door slams. Alfred is terrified."
    }
    ```

### BEAD-002: Spence's Sacrifice
- **Mood:** Tragic, Chaotic, Desperate.
- **Narrative Goal:** Establish the lethality of the Old World and the villain's power.
- **Key Dialogue Moments:**
    - Spence pushing John out of the way of a shadow-scythe.
    - John's first "Temporal Sight" glitch (time slows as he watches Spence fall).
- **Mechanical Hook:** Triggers the permanent removal of "Spence" from the party and the awakening of John's "Temporal Sight" ECS component.

---

## Narrative Constraints (The Bard's Rules)
1. **No Filler:** Every line of dialogue must reveal character or advance the mood.
2. **Context-Rich:** Payloads must include the current pigment levels (Soul Canvas) to influence voice.
3. **The Golden Thread:** Ensure every bead references the overarching "Cosmic Prison" theme.
