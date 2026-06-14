# Researcher Stats Schema v0.1

This schema describes the `researcher.stats.v1` payload attached to Corvus
Researcher proposal records and dispatch packets.

The payload exists for statistical analysis. It lets Corvus compare proposal
quality, Focus Charter fit, verification density, and downstream outcomes over
time. It does not authorize execution, merge, publication, model spend, or
operator bypass.

## Object Shape

```json
{
  "schema_version": "researcher.stats.v1",
  "computed_at": "2026-06-14T00:00:00.000000+00:00",
  "focus_contract": {},
  "features": {},
  "gungnir": {}
}
```

## Required Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | string | Must be `researcher.stats.v1`. |
| `computed_at` | string | UTC ISO timestamp for the current calculation. |
| `focus_contract` | object | The Focus Charter contract used for this proposal. |
| `features` | object | Countable proposal properties used for analysis. |
| `gungnir` | object | Gungnir v1.0 matrix derived from features and focus fit. |

## Feature Fields

The first implementation records deterministic counts and flags:

- `spoke`
- `repo_present`
- `risk`
- `has_title`
- `target_path_count`
- `change_outline_count`
- `implementation_step_count`
- `verification_command_count`
- `research_basis_count`
- `corroboration_count`
- `review_packet_count`
- `risk_critique_count`
- `test_plan_expansion_count`
- `dependency_audit_count`
- `lead_evidence_count`
- `collector_query_count`
- `contradiction_check_count`
- `issue_draft_count`
- `repo_target_validation_present`
- `evidence_packet_count`

These fields are intentionally simple so they can be compared across many
Researcher runs without inspecting private evidence bodies.

## Gungnir v1.0 Fields

The `gungnir` object uses the same canonical field names as the CStar Gungnir
matrix:

- `version`
- `logic`
- `style`
- `intel`
- `gravity`
- `vigil`
- `evolution`
- `anomaly`
- `sovereignty`
- `overall`
- `stability`
- `coupling`
- `aesthetic`

Scores are bounded numeric values from 0 to 10. `version` is `1.0`.

## Interpretation

Use the score to ask better questions:

- Did accepted proposals have higher verification density?
- Did high anomaly proposals get rejected more often?
- Did watch-only briefs later become useful?
- Did Gungnir overall correlate with PMT acceptance, rework, or live-fire
  success?

Do not use the score as an automatic gate until Corvus has enough statistical
evidence to justify a threshold and confidence model.

## Active Scope

Researcher stats are valid only in the current Focus Charter frame:

`CStar, Kernel, Researcher, Forge, Skills, XO, Moonshot`

Business-separated and parked work requires explicit operator authorization
before it can be treated as active Researcher scope.
