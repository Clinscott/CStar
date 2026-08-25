# Succession and rotation

Persistent controller continuity is a CStar lifecycle transition. A local
manifest is evidence and cannot appoint a controller.

The only valid transition is atomic:

`revoke old generation -> identify new generation -> bind handoff packet -> append event`

The old generation enters `DRAINING` or `QUARANTINED`. A stale generation,
missing handoff, contradictory receipt, or capability drift fails closed.
Automatic continuation, duplicate dispatch, silent retry, and self-succession
are prohibited. Escalate material design drift, destructive risk, uncertain
authority, protected effects, or an operator product choice.
