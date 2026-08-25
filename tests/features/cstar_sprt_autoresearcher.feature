Feature: deterministic host-only CStar SPRT AutoResearcher

  Rule: The runner proves a synthetic lifecycle without owning CStar authority

    Scenario: A stable full lifecycle crosses the Wald stable boundary
      Given the checker root is the current CStar worktree
      And the focused lifecycle module tuple is a hard source constant
      And callers cannot supply commands, modules, Node paths, or SPRT hypotheses
      And the runner selects one native-compatible Node by bounded no-write probes
      When one stage pass succeeds and bounded full-lifecycle trials repeat
      Then the runner records request, authorization, synthetic execute, delivered-unverified, independent record-result, and closeout coverage
      And the SPRT verdict is ACCEPTED only with a positive trial denominator
      And workflow_score and sprt_verdict remain separate fields
      And cstar_acceptance is UNVERIFIED

    Scenario: A trial failure produces a repair proposal only
      Given a protected lifecycle test process exits unsuccessfully
      When the bounded runner evaluates the trial
      Then the verdict is REJECTED or INCONCLUSIVE and never CStar ACCEPTED
      And failed-stage fingerprints are bounded
      And next_action is dispatch_repair_bead
      And no source, registry, Hall, SQLite, Git, provider, or network mutation occurs

    Scenario: Missing or skipped protected coverage fails closed
      Given TAP output omits or skips a protected lifecycle stage
      When the runner evaluates the stage pass or a full-lifecycle trial
      Then the run cannot produce ACCEPTED
      And the missing or skipped stage is named in stage coverage evidence

    Scenario: Timeout and malformed TAP are not successful trials
      Given a subprocess exceeds its bounded timeout or emits malformed TAP
      When the runner records the process result
      Then the stop reason identifies timeout or malformed output
      And cstar_acceptance remains UNVERIFIED

    Scenario: Terminal TAP plans are exact
      Given TAP contains one top-level terminal plan
      Then its plan count equals the parsed top-level outcomes
      And aggregate failures, cancellations, skips, and todos are zero
      But a missing, malformed, duplicate, conflicting, or nonterminal plan fails closed

    Scenario: Host limits cannot be widened
      Given max trials, per-process timeout, and total wall deadline are hard source constants
      When a caller supplies a lower positive cap
      Then the lower cap is enforced
      But a value above any hard cap is rejected before lifecycle execution

    Scenario: Native Node compatibility fails closed
      Given the PATH Node is incompatible with the installed native dependency
      When bounded standard NVM candidates are probed with an in-memory smoke
      Then exactly one compatible absolute Node path is selected and recorded
      But if none is compatible the verdict can never be ACCEPTED

    Scenario: Receipts require an explicit destination
      Given no output directory is supplied
      When the host-only runner completes
      Then it emits structured stdout evidence without writing a receipt file
      When an output directory is supplied inside the checker root
      Then it writes receipt.json and receipt.sha256 only there

    Scenario: The combined receipt carries canonical Gungnir evidence
      Given candidate sources include supported files and an unsupported .feature file
      When the host-only runner invokes the fixed TypeScript Gungnir calculus
      Then every supported candidate has its canonical matrix, ordered breaches, source hash, and evidence hash
      And the aggregate overall score is the arithmetic mean over scored_count
      And the unsupported file is listed with reason unsupported_extension
      And canonical engine, schema, scorer-command, process, and aggregate hashes are recorded
      And authority is heuristic_evidence_only with no baseline, delta, or production claim

    Scenario: Invalid Gungnir evidence fails the combined run closed
      Given the scorer process times out, fails, emits malformed output, or scores no candidate
      When the host-only runner completes
      Then the Gungnir evidence is invalid and the combined run cannot be ACCEPTED
      And no provider, network, CStar, Hall, SQLite, Git, or receipt mutation occurs outside the requested receipt directory
