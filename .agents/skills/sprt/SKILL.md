# 🔱 GUNGNIR SPRT SKILL (v1.0)

## MANDATE
Perform Sequential Probability Ratio Tests (SPRT) to statistically verify system stability, hypothesis acceptance, and GPHS delta significance.

## LOGIC PROTOCOL
1. **HYPOTHESIS FORMATION**: Set alpha/beta error boundaries and null/alternative hypothesis probabilities (stable vs. flaky).
2. **TRIAL RECORDING**: Calculate Wald Likelihood Ratios for sequential test trials.
3. **LOG-ODDS EVALUATION**: Map score deltas to log-likelihood ratios to determine statistical significance.
4. **JUDGMENT DECREE**: Return ACCEPT (Stable), REJECT (Flaky/Regression), or CONTINUE (Need more trials).

## USAGE
`cstar sprt --eval --pre <score> --post <score>`
`cstar sprt --trial --success <bool> [--reset]`
