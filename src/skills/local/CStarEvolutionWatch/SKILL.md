# CStar Evolution Watch — Daily Intelligence Report

## Pipeline

Runs a daily inspection of the CStar codebase, researches hardening paths on the web,
runs a Karpathy LLM Wiki loop on the most promising ideas, and outputs a report
to `docs/reports/`.

## Pipeline Stages

```
Inspect CStar
    │
    ▼
Research Each Finding (DuckDuckGo)
    │
    ▼
Karpathy Wiki Loop (LLM Wiki — file + cross-reference findings)
    │
    ▼
Generate Report → docs/reports/CSTAR_EVOLUTION_WATCH_YYYY-MM-DD.md
```

## Research Queries Per Finding

| Finding | Query |
|---------|-------|
| SQLite WAL | "sqlite3 WAL mode concurrent writes performance python" |
| Dataclass validation | "python dataclass validation pydantic attrs security" |
| Duplicate detection | "semantic deduplication code review text similarity" |
| Security warden | "OWASP agentic AI threats mitigations 2025" |
| MuninnHeart cycle | "autonomous AI agent loop architecture hardening" |
| Cortex stale knowledge | "RAG knowledge base update refresh stale" |
| Vector cache | "LLM vector search cache eviction LRU python" |
| Bead contracts | "agentic AI OWASP Top 10 2025 bead system security" |
| Broken import | "python TheWatcher stability monitoring pattern" |
| Test suite | "python pytest architecture testing best practices" |
| Gungnir scoring | "scoring algorithm validation data quality" |
| SovereignHUD | "python terminal ANSI colors tty detection" |

## Wiki Loop (Karpathy LLM Wiki)

For each finding that shows promise during research:

1. **Query the wiki** — does this topic already have pages?
2. **If no existing page**: Create `concepts/cstar-evolution-<finding>.md`
3. **If existing page**: Update with new research findings
4. **Cross-reference**: link to at least 2 related pages (e.g., security concepts, SQLite patterns)
5. **Log** the action in `log.md`

Wiki lives at `~/wiki/` (configured in `~/.hermes/config.yaml`).

## Report Output

`docs/reports/CSTAR_EVOLUTION_WATCH_YYYY-MM-DD.md`

Structure:
- Header: date, finding count, severity summary
- Finding cards (one per finding)
- Research highlights per finding
- Wiki-filed items (cross-reference links)
- Top 3 priorities for the day
- Actionable BEADs proposed

## Cron Schedule

Recommended: daily at 07:00 Canada/Eastern, before human review.

```bash
# Create the cron job
hermes cron create \
  --name "CStar Evolution Watch" \
  --prompt "Run the cstar-evolution-watch skill. Inspect CStar at /home/morderith/Corvus/CStar, run web research, file wiki entries, generate report to docs/reports/" \
  --schedule "0 7 * * *" \
  --skills cstar-evolution-watch \
  --deliver local
```

## Arguments

None required. The skill self-contains all paths.

## Environment

- `CSTAR_ROOT`: `/home/morderith/Corvus/CStar`
- `WIKI_ROOT`: `~/wiki`
- `REPORT_DEST`: `{CSTAR_ROOT}/docs/reports/`

## Output Artifacts

- `docs/reports/CSTAR_EVOLUTION_WATCH_YYYY-MM-DD.md` — the daily report
- `~/wiki/concepts/cstar-evolution-*.md` — filed research (Karpathy loop)
- `~/.hermes/logs/cstar-evolution-watch.log` — run log
