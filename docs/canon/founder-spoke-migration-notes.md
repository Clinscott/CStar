# Founder Spoke Migration Notes

Status: derived canon from CStar White Paper v0.3

## Purpose

The existing CStar spokes are founder spokes: reference implementations from
the creator's current CStar build. They demonstrate the framework but do not
limit what operators can create.

This document records the initial migration posture for those spokes. It does
not mutate runtime registries or grant new authority.

## Founder Spokes

| Founder spoke | Category | Likely slots | Functional role | Example manifestation |
| --- | --- | --- | --- | --- |
| CorvusEye | Observation / Scout | Familiar | Authorized observation, owned-system exposure awareness, inbound signal summaries, lab-safe recon planning. | Raven, watcher-bird, spectral corvid companion. |
| SecureSphere | Defense / Wardenry | Shield, Armor, Aura | Security posture, validation, guardrails, hardening recommendations, protective checks. | Mesh dome, shield wall, radiant ward. |
| Taliesin | Story / Voice | Voice, Relic, Companion | Narrative, teaching, onboarding, quest text, release chronicles, lore summaries. | Lyre, quill, bardic mask, glyph chorus. |
| XO | Companion / Tutor | Companion | Planning, tutoring, reflection, personal operating support, decision review. | Lantern bearer, mirror spirit, quiet guide. |

## Migration Rules

- Existing spokes should be migrated into category, eligible slot,
  functional-role, authority, risk, validation, and visibility fields.
- Founder spokes must remain examples, not mandatory global classes.
- Visual or mythic identity must be stored separately from authority and
  execution mode.
- Security-sensitive spokes must default to authorized owned-system contexts.
- Any authority increase requires a Refinement Gate and Warden validation.

## Boundaries

- CorvusEye supports owned-system observation, defensive reconnaissance,
  consent-based tests, labs, CTFs, and authorized client work. It must not be
  framed as unauthorized access.
- SecureSphere should begin with observe and advise authority, then earn
  confirmed local action only after validation.
- Taliesin may adorn truth but must retain a plain technical version.
- XO supports planning, tutoring, reflection, and life operations. It does not
  replace professional medical, legal, financial, or emergency help.
