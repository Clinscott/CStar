# 🔱 NEURAL WARDEN SKILL (v1.0)

## MANDATE
Monitor and harden the repository against anomalies, lore violations, and system drift using localized neural models.

## LOGIC PROTOCOL
1. **ANOMALY DETECTION**: Execute the Anomaly Warden (Canary) to monitor latency, tokens, loops, and errors.
2. **LORE GROUNDING**: Measure alignment between agent actions and documented intents.
3. **CIRCUIT BREAKING**: Halt forge loops or sessions if critical system drift is detected.
4. **CONTINUOUS HARDENING**: Train the Warden models on new mission data (Success vs. Failure).

## USAGE
`cstar warden --train <cycles>`
`cstar warden --eval <metadata_vector>`
`cstar warden --check --file <path> --action <text>`
