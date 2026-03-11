# RECURSIVE MEMORY SKILL

## MANDATE
Record runtime observations as Hall-backed feedback without mutating canonical skill contracts.

## LOGIC PROTOCOL
1. **RECORD KEEPING**: Persist runtime feedback as a Hall skill observation.
2. **COMPATIBILITY ONLY**: Do not mutate `.feature` or `contract.json` surfaces directly.
3. **ESCALATION PATH**: Route real contract evolution through a sovereign bead plus `cstar evolve --action propose`.

## USAGE
`cstar memory --log-feedback --skill <name> --observation <text>`
