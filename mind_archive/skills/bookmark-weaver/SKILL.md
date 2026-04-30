---
name: bookmark-weaver
description: "Autonomous ingest of X bookmarks into the Corvus Hall Bead Ledger. Use to bootstrap daily integration missions."
risk: safe
source: internal
---

# BOOKMARK WEAVER

## MANDATE
To provide a non-human bridge between X bookmarks and the Corvus Estate. 
The weaver fetches authenticated bookmarks using `twikit`, normalizes them into `SovereignBeads`, and injects them into the `PennyOne` database for subsequent agent processing.

## ARCHITECTURE
- **Ingest**: Python (`twikit`)
- **Storage**: SQLite (`synapse.db` / `hall_beads`)
- **Trigger**: Can be invoked as a direct skill or as a recurring ritual.

## USAGE
`cstar skill bookmark-weaver`

## SWARM NOTE
This skill creates the beads that the `autobot` skill then consumes. It is the 'Producer' in the Producer/Consumer autonomy loop.
To minimize VRAM, this skill should be run first (to populate the queue), followed by `autobot --claim-next` (to process the queue).
