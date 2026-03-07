# 🔱 NORN TASK COORDINATION SKILL (v1.0)

## MANDATE
Manage the Ledger of the Norns by synchronizing project tasks with the PennyOne database and generating executable "Beads" for Raven Wardens.

## LOGIC PROTOCOL
1. **TASK SYNCHRONIZATION**: Parse `tasks.qmd` and ingest open items into the `norn_beads` database table.
2. **PRIORITY CALCULATION**: Assign bead priority based on vertical position and mission criticality.
3. **BEAD CLAIMING**: Identify and assign the highest priority "OPEN" bead to a requesting agent.
4. **RESOLUTION FLOW**: Mark beads as "RESOLVED" and update `tasks.qmd` checkmarks automatically.

## USAGE
`cstar norn --sync`
`cstar norn --next --agent <id>`
`cstar norn --resolve <bead_id>`
