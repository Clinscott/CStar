---
name: sprt-verifier
description: Statistical verification using Sequential Probability Ratio Test (SPRT). Use when you need to determine if a set of test results or an optimization is statistically significant and stable, rather than just a fluke of the current run.
---

# 🔱 SPRT Verifier Skill [Ω]

This skill provides a mathematically rigorous way to accept or reject hypotheses about system performance.

## When to Use

- Use after running a batch of tests to determine if the results are "Stable" or "Flaky."
- Use during optimization tasks to verify if a change actually improves the system.
- Use when you need a "Gungnir Gate" to authorize a code promotion.

## Usage

Run the bundled script to calculate the Log-Likelihood Ratio (LLR):

```bash
node scripts/validate_sprt.cjs <passed_count> <total_count>
```

### Interpretation

- **ACCEPTED**: The improvement is statistically significant. Proceed with promotion.
- **REJECTED**: The change has caused a regression or is unacceptably flaky. Revert or refine.
- **INCONCLUSIVE**: Not enough trials have been run to reach significance. Continue testing.
