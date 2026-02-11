---
description: Run the Ravens iteration protocol to test and harden the Gauntlet
---

# Ravens Iteration Protocol

This workflow runs the Ravens harness to test the Gauntlet pipeline against real codebase targets using mock AI responses, then diagnoses failures for hardening.

## Prerequisites
- The project must be at `c:\Users\Craig\Corvus\CorvusStar`
- Python environment must be active
- No API key needed (uses mock/synthetic responses)

## Steps

### 1. Run the Harness (100 iterations, dry-run)
// turbo
```
python tests/ravens_harness.py --iterations 100 --dry-run
```

### 2. Review Results
// turbo
```
python -c "import json; d=json.load(open('tests/ravens_harness_results.json')); print(f'Passed: {d[\"passed\"]}, Failed: {d[\"failed\"]}'); [print(f'  {k}: {v}') for k,v in d.get('failure_breakdown',{}).items()]"
```

### 3. Analyze Failures
For each FAILED iteration in `tests/ravens_harness_results.json`:
1. Read the `failure_class` field (SYNTAX, INDENT, IMPORT, RUNTIME, etc.)
2. Read the `failure_detail` field for the specific error
3. Check `sanitizer_actions` to see what the sanitizer attempted
4. Determine if `code_sanitizer.py` should have caught this failure

### 4. Classify Fix Locations
- If the sanitizer **should have caught it**: File a fix in `src/sentinel/code_sanitizer.py`
- If the **prompt was wrong**: File a prompt improvement in `sovereign_fish.py`'s `_run_gauntlet` prompt
- If the **test infrastructure was wrong**: File a fix in `tests/ravens_harness.py`

### 5. Run Sanitizer Tests
// turbo
```
python -m pytest tests/contracts/test_code_sanitizer.py -v
```

### 6. Run Full Contract Tests
// turbo
```
python -m pytest tests/contracts/ -v --tb=short
```

### 7. Report
Output a summary with:
- Total iterations / passed / failed
- Failure breakdown by class
- Top 5 failing files
- Recommended fixes (what to change in code_sanitizer.py or sovereign_fish.py)
