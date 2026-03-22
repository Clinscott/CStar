#!/usr/bin/env node
/**
 * [Ω] SPRT Verifier Logic (Translated from CStar/sterileAgent/fishtest.py)
 * Purpose: Provide deterministic statistical verification for gemini-cli.
 */

const fs = require('fs');
const path = require('path');

function calculateLLR(passed, total, alpha = 0.05, beta = 0.05, elo0 = 0.0, elo1 = 5.0) {
    if (total === 0) return { verdict: 'INCONCLUSIVE', llr: 0, summary: 'No data.' };

    const A = Math.log(beta / (1 - alpha));
    const B = Math.log((1 - beta) / alpha);

    const p0 = 1.0 / (1.0 + Math.pow(10.0, -elo0 / 400.0));
    const p1 = 1.0 / (1.0 + Math.pow(10.0, -elo1 / 400.0));

    const llr = passed * Math.log(p1 / p0) + (total - passed) * Math.log((1 - p1) / (1 - p0));

    let verdict = 'INCONCLUSIVE';
    let summary = 'Statistical significance not reached.';

    if (llr >= B) {
        verdict = 'ACCEPTED';
        summary = `PASS (Accepted): LLR ${llr.toFixed(2)} >= B ${B.toFixed(2)}`;
    } else if (llr <= A) {
        verdict = 'REJECTED';
        summary = `FAIL (Rejected): LLR ${llr.toFixed(2)} <= A ${A.toFixed(2)}`;
    }

    return { verdict, llr, summary, bounds: { A, B } };
}

const args = process.argv.slice(2);
const passed = parseInt(args[0]);
const total = parseInt(args[1]);

if (isNaN(passed) || isNaN(total)) {
    console.error('Usage: validate_sprt.cjs <passed_count> <total_count>');
    process.exit(1);
}

const result = calculateLLR(passed, total);
console.log(JSON.stringify(result, null, 2));
