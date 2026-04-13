# CStar Evolution Watch

**Generated:** 2026-04-11 08:19:49 Canada/Eastern  

**CStar Root:** `/home/morderith/Corvus/CStar`  

**Findings:** 10 total

## Severity Summary

| Priority | Count | Findings |
|----------|-------|----------|
| P1 | 3 | `f01`, `f08`, `f09` |
| P2 | 5 | `f02`, `f03`, `f05`, `f06`, `f10` |
| P3 | 2 | `f07`, `f11` |

## Karpathy Loop: 0/10 findings analyzed


## Detailed Findings

### [CRITICAL] f01 — SQLite: No WAL, No busy_timeout, Connection Per Call

**Component:** `bead_ledger.py`
**Effort:** ~2.0h

**Problem:** HallOfRecords.connect() uses plain sqlite3.connect() with no journal mode, no WAL, no busy_timeout. Every call creates a new connection. BEGIN IMMEDIATE in upsert operations serializes writes entirely — produces 'database is locked' errors under concurrent multi-agent load.

**Impact:** Correctness failure under concurrent load. Write operations will fail with locked errors as agent count scales. BEGIN IMMEDIATE is a pessimistic lock that blocks all concurrent writers.

**Proposed Work:**

  1. Enable WAL on first connect: PRAGMA journal_mode=WAL
  2. Set busy_timeout: PRAGMA busy_timeout=5000
  3. Consider BEGIN CONCURRENT for true optimistic concurrent writes
  4. Add PRAGMA synchronous=NORMAL for balanced safety/speed
  5. Connection-per-call pattern is fine for SQLite — pragmas are the fix

**Research Highlights:**

- *[GitHub - joedougherty/sqlite3_concurrent_writes_test_suite: Simultating concurrent writes to sqlite3 with multiprocessing and pytest · GitHub](https://github.com/joedougherty/sqlite3_concurrent_writes_test_suite)*  
  > Here are some reasons to give it a try, straight from the sqlite3 documentation: There are advantages and disadvantages to using WAL instead of a rollback journal. Advantages include: *WAL is signific

- *[charles leifer | Going Fast with SQLite and Python](https://charlesleifer.com/blog/going-fast-with-sqlite-and-python/)*  
  > The semantics of pysqlite can give ... of the global write lock and the bad behavior of pysqlite. The most general would be touse the write-ahead-logging (WAL) journal_mode option....

- *[SQLite WAL Mode: 10x Performance for Python Apps - DEV Community](https://dev.to/lumin-playstar/sqlite-wal-mode-10x-performance-for-python-apps-4ic)*  
  > March 10, 2026 -... Concurrent Reads and Writes: This is the biggest win.Readers can continue reading from the main database file (and applying relevant WAL changes) while writers are simultaneously a

- *[The Write Stuff: Concurrent Write Transactions in SQLite – Oldmoe's blog](https://oldmoe.blog/2024/07/08/the-write-stuff-concurrent-write-transactions-in-sqlite/)*  
  > July 8, 2024 -With our approach though we can do transaction grouping, thus we can distribute the cost of a single fsync call on many concurrent transactions. Resulting in much higher performance in h

---

### [CRITICAL] f08 — No Automated Test Suite Visible

**Component:** `tests/`
**Effort:** ~4.0h

**Problem:** No tests/ directory, no pytest.ini, no CI configuration visible. bead_ledger.py has complex state machine logic (normalization, legacy supersession, duplicate detection) that will accumulate bugs without regression coverage. Several files show inconsistent type annotation styles.

**Impact:** Correctness risk. Any refactor or feature addition has no guard against regressions. The complexity of the bead state machine is particularly vulnerable to silent breakage.

**Proposed Work:**

  1. Write tests/test_bead_ledger.py covering:
     - upsert_bead with duplicate detection
     - claim_bead / claim_next_bead / claim_next_p1_scan_bead transitions
     - normalize_existing_beads legacy supersession logic
     - resolve_bead / mark_ready_for_review / block_bead transitions
     - sync_tasks_projection
  2. Add ruff or pylint lint step
  3. Set up GitHub Actions (free, 10 min to configure)

**Research Highlights:**

- *[pytest Tutorial: Effective Python Testing - Real Python](https://realpython.com/pytest-python-testing/)*  
  > Masterpytestwith this hands-on tutorial. Learn fixtures, parametrize, marks, and plugins to write fast, effectivePythontest suites.

- *[High-Quality Code with PyTest | Medium](https://medium.com/@marco.petri.mp/high-quality-code-with-pytest-managing-complexity-in-python-applications-bb92ab4518f1)*  
  > AdvancedPyTestguide fortestingcomplexPythonapps: structure tests, use JSON data, manage mocks and dependencies for clean, maintainable code.

- *[Python Pytest Architecture: Fixtures, Mocking & Property Testing (2026)](https://logicandlegacy.blogspot.com/2026/04/python-pytest-architecture-fixtures.html)*  
  > PythontestingwithPytest. Learn how to architect fixtures for dependency injection, use the Humble Object pattern for mocking, and test invariants.

- *[Python Testing - Unit Tests, Pytest, and Best Practices](https://dev.to/nkpydev/python-testing-unit-tests-pytest-and-best-practices-45gl)*  
  > Writing tests ensures that your code works as expected and helps prevent bugs from creeping into your... Tagged withpython, programming,testing,pytest.

---

### [CRITICAL] f09 — MuninnHeart: Broken Import — TheWatcher Not Found

**Component:** `muninn_heart.py`
**Effort:** ~0.5h

**Problem:** muninn_heart.py imports: 'from src.core.engine.ravens.stability import TheWatcher'. No src/core/engine/ravens/stability.py exists in the repository. This import would fail at runtime, preventing MuninnHeart from being instantiated.

**Impact:** Runtime import failure. MuninnHeart cannot be used until this is resolved — either by creating stability.py or fixing the import.

**Proposed Work:**

  1. Verify TheWatcher class exists in the codebase
  2. If it doesn't exist: create stub at src/core/engine/ravens/stability.py
  3. If it exists elsewhere: fix the import path

**Research Highlights:**

- *[GitHub - fgmacedo/python-statemachine: Expressive statecharts and...](https://github.com/fgmacedo/python-statemachine)*  
  > Observerpattern— register external listeners towatchevents andstatechanges. Django integration — auto-discoverstatemachinesin Django apps with MachineMixin. Diagram generation — via f-strings (f"{sm:m

- *[class - How to initializepythonwatchdogpattern... - Stack Overflow](https://stackoverflow.com/questions/56475328/how-to-initialize-python-watchdog-pattern-matching-event-handler)*  
  > I'm using thePythonWatchdogtomonitora directory for new files being created.Bring the best of human thought andAIautomation together at your work. Explore Stack Internal. How to initializepythonwatchd

- *[Examples -python-statemachine3.0.0](https://python-statemachine.readthedocs.io/en/latest/auto_examples/index.html)*  
  > python-statemachine3.0.0.Loopingstatemachine. Async without external loop. Weighted idle animationmachine. Traffic lightmachine. Enum campaignmachine. Order controlmachine.

- *[Building a simpleStateMachineinPython. - DEV Community](https://dev.to/karn/building-a-simple-state-machine-in-python)*  
  > Tagged withstatemachines,python, beginners.What thisstatemachinedoes is defines a startingstateLockedState and exposes a function to handle events. This function basically assigns the currentstateto t

---

### [HIGH] f02 — HallBeadRecord: Raw Dataclass with No Field Validation

**Component:** `hall_schema.py`
**Effort:** ~2.0h

**Problem:** HallBeadRecord and HallRepositoryRecord are bare @dataclass with no field validators. Invalid types, out-of-range values, or None where NOT NULL applies only fail at the SQLite layer with cryptic errors. No __post_init__ validation exists.

**Impact:** Data integrity risk. Bad records can enter the ledger and cause hard-to-debug failures downstream. The validation surface is entirely implicit and dependent on SQLite constraints.

**Proposed Work:**

  1. Add __post_init__ validators to HallBeadRecord and HallRepositoryRecord
  2. Validate: bead_id is non-empty string, status in HallBeadStatus,
     timestamps are positive integers
  3. Consider attrs @attr.s with validators for better performance
  4. Or use pydantic for validation layer only, keep dataclass for storage

**Research Highlights:**

- *[Jack McKew's Blog – Dataclasses vs Attrs vs Pydantic](https://jackmckew.dev/dataclasses-vs-attrs-vs-pydantic.html)*  
  > August 7, 2020 -Thank you to Michael Kosher over on Twitter: It's worth noting validation can be added to dataclasses using a __post_init hook. However, it's pretty low level relative to attrs/#pydant

- *[Dataclasses - Pydantic Validation](https://docs.pydantic.dev/latest/concepts/dataclasses/)*  
  > While Pydantic dataclasses support the extra configuration value, some default behavior of stdlib dataclasses may prevail. For example, any extra fields present on a Pydantic dataclass with extra set 

- *[Measuring Performance Differences Between pydantic, dataclass, attrs](https://ryanlstevens.github.io/2023-12-04-performancePythonDataclasses/)*  
  > We can easily see thatdataclass and attrs is much much faster. This is a well known outcome. The reason is that pydantic not only initializes an object, it also runs validation on the attributes of th

- *[Dataclasses - Pydantic](https://docs.pydantic.dev/1.10/usage/dataclasses/)*  
  > Since stdlib dataclasses are automatically converted to add validation using custom types may cause some unexpected behaviour. In this case you can simply add arbitrary_types_allowed in the config! ..

---

### [HIGH] f03 — Duplicate Detection: String-Only Rationale Comparison

**Component:** `bead_ledger.py / _find_active_duplicate`
**Effort:** ~2.0h

**Problem:** _find_active_duplicate() uses raw string equality on rationale as primary duplicate key. Two beads with semantically identical intent but different wording are treated as non-duplicates. The composite key (target_path, target_ref, target_kind) is not weighted over rationale text.

**Impact:** False negatives: legitimate duplicates missed due to wording. False positives: same rationale text on different files incorrectly flagged as duplicates. Both degrade ledger quality.

**Proposed Work:**

  1. Normalize rationale for comparison: strip(), lower(), remove code backticks
  2. Weight composite identity key over rationale text
  3. If two OPEN beads target same file with same acceptance_criteria, they are duplicates regardless of rationale wording

**Research Highlights:**

- *[Content similarity detection - Wikipedia](https://en.wikipedia.org/wiki/Content_similarity_detection)*  
  > ...detection(CbPD) 26 relies on citation analysis , and is the only approach to plagiarismdetectionthat does not rely on the textualsimilarity.

- *[Dealing withtext: How a Few Lines ofCodeMadeDuplicate... | Medium](https://medium.com/@bitreducer/dealing-with-text-how-a-few-lines-of-code-made-duplicate-detection-100x-faster-35930974db03)*  
  > In this article, I’ll share how a few lines ofcodeboostedduplicatedetectionperformance by over 100x. In the next one, I’ll dive intosemanticsimilarity— how todetectsimilarcontent, even when it’s worde

- *[Next-Gen AIAlgorithmsforDetectingand ResolvingDuplicate...](http://kijyomita.com/archives/2022-09.html?next-gen-ai-algorithms-for-detecting-and-resolving-duplicate-content-in-website-promotion)*  
  > Algorithmssuch as Universal Sentence Encoder or Sentence-BERT computesemanticvectors fortextsnippets, measuring theirsimilaritybeyond mere keyword overlap. This method accurately identifies content th

- *[(PDF) Analyzingsemanticsimilarityamongsttextualdocuments to...](https://www.academia.edu/88899315/Analyzing_semantic_similarity_amongst_textual_documents_to_suggest_near_duplicates)*  
  > Fastsemanticduplicatedetection[14] did automatictextdata deduplication with French and Englishtextin a particular region.In order to achieve a generalalgorithmfor this function, thesemanticfunction li

---

### [HIGH] f05 — MuninnHeart: Placeholder Loop Logic, Real Cycle Not Implemented

**Component:** `muninn_heart.py`

**Problem:** _run_behavioral_pulse() returns True after 0.1s sleep. The Hunt → Forge → Empire → SPRT → Memory cycle is stubbed out. MuninnPromotion, MuninnCrucible, MuninnMemory, TheWatcher are instantiated but their methods are never called in the loop. _wait_for_silence() just sleeps 1s — no git-status or filesystem-activity detection.

**Impact:** The ravens core loop does not execute its stated contract. MuninnHeart appears to run but no actual promotion, crucible testing, or memory persistence occurs. Would silently produce incomplete results in production.

**Proposed Work:**

  1. Implement actual Hunt→Forge→Empire→SPRT→Memory cycle
  2. _wait_for_silence() needs git-status and stat-based activity detection before taking flight
  3. The 6-hour endurance limit guard is good — keep it
  4. Recommend dedicated BEAD for full ravens cycle implementation

**Research Highlights:**

- *[The Agentic AI Handbook: A Beginner's Guide to Autonomous](https://www.freecodecamp.org/news/the-agentic-ai-handbook/)*  
  > To summarize, agenticAIsystems "solve complex, multi-step problems autonomously by using sophisticated reasoning and iterative planning." In ...

- *[Understanding AI Agent Architecture: The Foundation of](https://techpatio.com/2025/guest-posts/understanding-ai-agent-architecture-the-foundation-of-autonomous-intelligent-systems)*  
  > AIagentarchitecturesupportsautonomousdecision-making,learning, and adaptation, while traditional software typically follows predefined ...

- *[AI Agent in 2025: Ultimate Guide to Architecting Autonomous](https://asterdio.com/ai-agent-in-2025/)*  
  > AIagentsrange from simple chatbots to fullyautonomousworkflow orchestrators. ... At its core, anAIagentlies a powerful feedback-drivenloop...

- *[Loop AI Agents Orchestra | Loop AI Group Cognitive Computing](https://www.loop.ai/loop-ai-agents-orchestra)*  
  > Built on a vendor-agnosticarchitecture,LoopAIAgentsOrchestra seamlessly integrates diverseAItechnologies — including commercial APIs ...

---

### [HIGH] f06 — Cortex RAG: No Update Mechanism, Stale Knowledge Risk

**Component:** `cortex.py`
**Effort:** ~2.0h

**Problem:** Cortex.__init__ calls _ingest() which rebuilds the entire vector index from scratch on every initialization. No refresh(), update_skill(), or invalidation mechanism. If a skill or workflow document changes, Cortex serves stale results until process restart. No guard on total corpus size — could exhaust memory on large projects.

**Impact:** Stale knowledge in RAG responses. Documents updated on disk are not reflected in search results until restart. No mechanism to refresh incrementally. Large corpora could cause OOM.

**Proposed Work:**

  1. Add update_skill(trigger, text) method that removes old chunk and adds new one
  2. Add refresh() with stat-based dirty checking — re-read only changed files
  3. Add total corpus size guard — warn or reject if total ingested > 50MB

**Research Highlights:**

- *[How to Update RAG Knowledge Base Without Rebuilding Everything](https://particula.tech/blog/update-rag-knowledge-without-rebuilding)*  
  > The problem wasn't theirRAGarchitecture—it was theirupdatestrategy. They treated every change as a reason to rebuild the entireknowledgebasefrom scratch: re-chunking all documents, regenerating all em

- *[Managing Knowledge Base Updates and Refresh Cycles](https://apxml.com/courses/optimizing-rag-for-production/chapter-7-rag-scalability-reliability-maintainability/rag-knowledge-base-updates)*  
  > Vector Database Specifics: The efficiency and atomicity of add, update, and delete operations vary between vector databases. Some may not efficiently support in-place updates, requiring a delete-then-

- *[The Refresh Trap: The Hidden Economics of Vector Decay in RAG Systems | by Eyosias Teshale | Medium](https://medium.com/@eyosiasteshale/the-refresh-trap-the-hidden-economics-of-vector-decay-in-rag-systems-f73bc15aa011)*  
  > October 28, 2025 -Cohere’s engineers describe this as “representation shearing,” where older vectors lose relevance not because the data changed, but because the model’s conceptual space did. Even sta

- *[How to Build RAG Systems with Real-Time Data Updates](https://markaicode.com/build-rag-systems-real-time-data-updates/)*  
  > Real-timeRAGsystems solve this problem by continuously ingesting fresh data and updatingvectorembeddings on-demand. You'll learn to build streaming data pipelines, implement incrementalvectorupdates, 

---

### [HIGH] f10 — Bead Contracts: No Pre-Execution Security Audit

**Component:** `heimdall_shield.py + bead_ledger.py`
**Effort:** ~2.0h

**Problem:** heimdall_shield handles command-level blocking (rm -rf /, git reset --hard, fork bombs) but does not audit bead contract content before execution. A bead's checker_shell, rationale, or acceptance_criteria could contain injected commands or secrets — the shield only fires after the command runs.

**Impact:** Post-hoc blocking is insufficient for bead contracts. A malicious or compromised bead could modify system state beyond its scoped target before heimdall catches it.

**Proposed Work:**

  1. Add bead contract auditor: before any checker_shell executes, validate against heimdall_shield patterns
  2. Add provenance tracking: record which LLM generated each bead
  3. Enforce HallBeadRecord.source_kind field — currently rarely populated
  4. Integrate with OWASP Agentic AI Top 10 threat categories

**Research Highlights:**

- *[Tackling Agentic AI security – EA Voices](https://eavoices.com/2025/12/01/tackling-agentic-ai-security/)*  
  > By Sandeep Singh Executive SummaryAgenticAIintroduces uniquesecuritychallenges beyond traditional GenAI and modelsecurity.

- *[Agentic AI – EA Voices](https://eavoices.com/category/agentic-ai/)*  
  > Categories ,AgenticAI,AIAgents ,AIAssistants , Articles , Artificial Intelligence , Assistants , business transformation , EA Articles , EA ...

- *[AI and Sports – Security vs. Privacy – EA Voices](https://eavoices.com/2024/10/17/ai-and-sports-security-vs-privacy/)*  
  > Link: https://www.architectureandgovernance.com/artificial-intelligence/ai-and-sports-security-vs-privacy/ ... Leadership machine learningSecurity...

- *[AI Agents – EA Voices](https://eavoices.com/category/ai-agents/)*  
  > Categories ,AgenticAI,AIAgents ,AIAssistants , Articles , Artificial Intelligence , Assistants , business transformation , EA Articles , EA ...

---

### [MEDIUM] f07 — SovereignVector: Unbounded Cache Growth, No Eviction

**Component:** `vector.py`
**Effort:** ~2.0h

**Problem:** _search_cache dict and shadow index are built in-memory with no eviction policy. Under heavy use both grow unboundedly. Shadow index is rebuilt in-memory on every build_index() call rather than persisted to disk.

**Impact:** Memory exhaustion over long runtime. Shadow index rebuild on every call is expensive. No cache efficiency signal for repeated queries.

**Proposed Work:**

  1. Add LRU eviction to _search_cache: maxsize=512 using functools.lru_cache or manual trim
  2. Persist shadow index to disk (pickle or sqlite) rather than rebuilding in-memory each call

**Research Highlights:**

- *[Python2.7 Memoization: Why No `functools.lru_cache](https://www.pythontutorials.net/blog/memoization-library-for-python-2-7/)*  
  > Python3’s functools.lru_cacheis a decorator that automates memoization withLeastRecentlyUsed(LRU)eviction.LRUensures thecachedoesn’t grow indefinitely: when thecachereaches a specified size (maxsize),

- *[Implementing aLeastRecentlyUsed(LRU)CacheinPython](https://llego.dev/posts/implement-lru-cache-python/)*  
  > TheLRUevictionpolicy removes theleastrecentlyuseditem first. The print() method shows the items ordered from most toleastrecentlyused. This demonstrates the core functionality of anLRUcacheimplemented

- *[CacheinPython! - DEV Community](https://dev.to/coderatul/cache-in-python--18g)*  
  > 1.cache: Simple,UnboundedMemoization. Thecachedecorator is a lightweight way to memoize function results, storing them for reuse when the same inputs occur again. It’s like a sticky note for your func

- *[An Introduction toCachinginPython](https://aaronnotes.com/2023/04/caching-in-python/)*  
  > LRU(LeastRecentlyUsed): Theleastrecentlyuseditems areevictedfrom thecachewhen thecachereaches its maximum size.

---

### [MEDIUM] f11 — Gungnir Scoring: Silent Fallback to 0.0 on Parse Failure

**Component:** `gungnir/schema.py / build_gungnir_matrix`
**Effort:** ~1.0h

**Problem:** build_gungnir_matrix() falls back to 0.0 for any unparseable score value without logging or raising. A corrupted score in the database silently becomes 0.0 — not detectable unless the output is manually reviewed.

**Impact:** Silent data corruption. Corrupted scores appear as legitimate 0.0 results and could drive bad prioritization decisions.

**Proposed Work:**

  1. Add _validate_gungnir_matrix() that raises on unexpected field types
  2. Emit a warning log for any field that falls back to 0.0
  3. Return a structured result that distinguishes 0.0 (real) from None (unavailable)

**Research Highlights:**

- *[10 Best Practices for Logging in Python - Better Stack](https://betterstack.com/community/guides/logging/python/python-logging-best-practices/)*  
  > As your application collects moredata, adopting properloggingpracticesbecomes crucial for swiftly and efficiently comprehending the overall functionality. This enables you to address issues before the

- *[logging | Python Best Practices - Real Python](https://realpython.com/ref/best-practices/logging/)*  
  > ReferencePythonBestPractices/loggingLoggingallows you to record what your code is doing. Goodlogginghelps you understand how your application behaves in production, diagnose issues, and trace requests

- *[Logging HOWTO — Python 3.14.4 documentation](https://docs.python.org/3/howto/logging.html)*  
  > When to uselogging¶ You can accessloggingfunctionality by creating a logger via logger =logging.getLogger(__name__), and then calling the logger's debug(), info(),warning(), error() and critical() met

- *[Python Logging Best Practices - Obvious and Not-So-Obvious](https://signoz.io/guides/python-logging-best-practices/)*  
  > MasterPythonloggingwith 12 provenbestpractices, code examples, and expert techniques for better debugging, monitoring, and production deployments.

---

## Top Priorities for Today

1. **SQLite: No WAL, No busy_timeout, Connection Per Call** — `bead_ledger.py` (~2.0h)

2. **No Automated Test Suite Visible** — `tests/` (~4.0h)

3. **MuninnHeart: Broken Import — TheWatcher Not Found** — `muninn_heart.py` (~0.5h)

## Proposed BEADs

| ID | Title | Priority | Effort |
|----|-------|----------|--------|
| `f01` | SQLite: No WAL, No busy_timeout, Connection Per Call | P1 | 2.0h |
| `f02` | HallBeadRecord: Raw Dataclass with No Field Validation | P2 | 2.0h |
| `f03` | Duplicate Detection: String-Only Rationale Comparison | P2 | 2.0h |
| `f05` | MuninnHeart: Placeholder Loop Logic, Real Cycle Not Implemented | P2 | TBD |
| `f06` | Cortex RAG: No Update Mechanism, Stale Knowledge Risk | P2 | 2.0h |
| `f07` | SovereignVector: Unbounded Cache Growth, No Eviction | P3 | 2.0h |
| `f08` | No Automated Test Suite Visible | P1 | 4.0h |
| `f09` | MuninnHeart: Broken Import — TheWatcher Not Found | P1 | 0.5h |
| `f10` | Bead Contracts: No Pre-Execution Security Audit | P2 | 2.0h |
| `f11` | Gungnir Scoring: Silent Fallback to 0.0 on Parse Failure | P3 | 1.0h |