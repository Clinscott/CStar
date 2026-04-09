# ============================================================
# CORVUS MOONSHOT TRACKER
# Corvus AI Lab — Sovereign AI Infrastructure for Canada
# ============================================================
#
# Three projects always on the go:
#   1. Immediate      — triage, cleanup, daily operational health
#   2. CStar Evolution — host-native runtime migration, registry hardening
#   3. Moonshot      — Canadian sovereign AI stack (research first)
#
# Moonshot work begins only when #1 and #2 are at safe steady state.
# This file tracks research targets, funding avenues, and steps.
#
# ============================================================

meta:
  version: "1.0"
  created: "2026-04-08"
  owner: Craig Linscott
  advisor: Gary Linscott
  lab: Corvus
  engine: CStar
  repo: /home/morderith/Corvus/CStar

# ============================================================
# THE MOONSHOT THESIS
# ============================================================
#
# Canada needs a sovereign AI stack — inference, agent runtime,
# and foundation model — built on Canadian values, running on
# Canadian infrastructure, governed by Canadian law.
#
# Being beholden to a friendly-country AI that could be cut
# off is a geopolitical risk. The response is infrastructure.
#
# Corvus is the engine. CStar is the proof. The Canadian
# foundation model is the destination.
#
# ============================================================

moonshot:
  name: "Canadian Sovereign AI Stack"
  thesis: |
    Canada requires sovereign AI infrastructure: a foundation model
    grounded in Canadian law, healthcare, government, and French/English,
    running on Canadian compute, governed by Canadian law, open to
    Canadian institutions, and incapable of being cut off because it
    exists on Canadian ground.
  primary_driver: |
    National sovereignty — the friendly-country AI cut-off scenario
    is not hypothetical. It is a geopolitical risk. Canada's response
    is to build the spine.
  secondary_driver: |
    Plant trees that future generations will benefit from. A technical
    legacy that outlasts the company and becomes public infrastructure.

  compute_on_hand:
    - label: "DGX Spark"
      arrives: "within 1 year"
      role: "primary training compute"
    - label: "M5 Mac Studio"
      arrives: "within 1 year"
      role: "main inference server"

  timeline:
    concept: "1 year"
    prototype: "2 years"

  team:
    lead_developer: Craig Linscott
    lead_advisor: Gary Linscott

# ============================================================
# RESEARCH TRACKING
# ============================================================
#
# Systems to research, track, and update as the moonshot develops.
# Each entry is a research thread — not a task, not a bead.
# Tasks and beads live in the Hall of Records.
#
# ============================================================

research:

  # --- COMPUTE & INFRASTRUCTURE ---

  - id: compute-canadian
    category: infrastructure
    topic: "Canadian sovereign compute options"
    status: active
    notes: |
      DGX Spark + M5 Mac Studio arriving within year.
      Need to map: what does "Canadian compute" mean for training?
      Are there NRC/ACRDI compute grants? Compute Canada applications?
      IRAP for dual-use (defence + AI)?
    sources: []

  - id: compute-distribution
    category: infrastructure
    topic: "On-premise vs cloud hybrid topology for Canadian institutions"
    status: pending
    notes: |
      Provincial health authorities and federal depts want on-premise.
      Can we design a deployment model that satisfies data residency
      without requiring internet connectivity?
    sources: []

  # --- THE MODEL ---

  - id: model-canadian-corpus
    category: model_research
    topic: "What data exists for a Canadian foundation model?"
    status: active
    notes: |
      Sources to survey:
      - Canada Gazette (federal legislation/regulation)
      - CanLII (Canadian legal precedent — open)
      - StatCan (Statistics Canada datasets)
      - Hospital records (de-identified, partner institutions)
      - THREATS / C-11 / PIPEDA case law
      - Radio-Canada / CBC archives (French + English)
      - Indigenous language corpora (FNIM / CTL)
    sources: []

  - id: model-base-architecture
    category: model_research
    topic: "Base model choices for Canadian fine-tune"
    status: active
    notes: |
      Step 1 path: fine-tune an open-weight model (Llama 3, Mistral,
      Qwen, Gemma) on Canadian corpus. Viable on DGX Spark.
      Step 2 path: continue-pretrain or full pretrain.
      Which models are commercially open for fine-tuning?
      What is the licence tree for each?
    sources: []

  - id: model-foundation-comparison
    category: model_research
    topic: "Comparable national foundation model initiatives"
    status: pending
    notes: |
      Finland (Sisu), France ( Fugene), UK (foundation model task force),
      Singapore (SAIST), India (Bhashini adjacent). What did they do?
      What were the funding vehicles? What were the compute strategies?
    sources: []

  # --- FUNDING ---

  - id: funding-federal
    category: funding
    topic: "Federal funding vehicles for sovereign AI infrastructure"
    status: active
    notes: |
      ISED — Innovation, Science and Economic Development
      NRC — National Research Council AI flags
      CAAAIS — Canadian AI Advisory Committee
      IRAP — Innovation, Research, Aerospace, Defence (ISED)
      SR&ED — Scientific Research and Experimental Development tax credit
        (CStar novel architecture likely claimable)
      Scale AI — supply chain but AI-adjacent
      DND — defence AI sovereignty
    sources: []

  - id: funding-provincial
    category: funding
    topic: "Provincial AI funding (Ontario, Quebec, BC, Alberta)"
    status: pending
    notes: |
      Ontario — OCE (Ontario Centre of Excellence)
      Quebec — MEI (Ministre de l'Economie)
      BC — BC Tech Fund
      Alberta — Technology Innovation Alberta
    sources: []

  - id: funding-accelerators
    category: funding
    topic: "Accelerator and VC landscape for Canadian AI moonshots"
    status: pending
    notes: |
      Vector Institute spinouts?
      Creative Destruction Lab (CDL) — AI stream
      Accelera (Quebec)
      FOAR (Federal Office of AI Research?)
    sources: []

  # --- REGULATORY & LEGAL ---

  - id: regulatory-pipeda
    category: regulatory
    topic: "PIPEDA requirements for AI in Canadian healthcare/legal"
    status: pending
    notes: |
      What does PIPEDA require for AI-assisted decision-making?
      Audit trail requirements? Consent? Data residency?
      How does this differ from GDPR for our purposes?
    sources: []

  - id: regulatory-provincial-health
    category: regulatory
    topic: "Provincial health information acts (PHIA, PHIPA, HIA)"
    status: pending
    notes: |
      Ontario PHIPA, Alberta HIA, BC FIPPA, Quebec Act respecting
      health services. Each has data residency requirements.
      Which provinces have the most restrictive AI-friendly frameworks?
    sources: []

  # --- MARKET & LANDING CUSTOMERS ---

  - id: market-healthcare
    category: market
    topic: "Canadian healthcare AI landscape and data residency needs"
    status: pending
    notes: |
      Provincial health authorities (Ontario Health, Alberta Health,
      Quebec MIISS?). Hospital networks. Pharma.
      Who is already running on US cloud and would switch?
    sources: []

  - id: market-legal
    category: market
    topic: "Canadian legal AI and document intelligence market"
    status: pending
    notes: |
      Law firms, bar associations, legal aid.
      CanLII already open — what inference layer on top?
    sources: []

  - id: market-government
    category: market
    topic: "Federal department AI procurement and sovereignty concerns"
    status: pending
    notes: |
      TBS (Treasury Board), Shared Services Canada, DND, ISED.
      Which depts are actively worried about foreign AI dependency?
    sources: []

  # --- EXISTING CORVUS ASSETS ---

  - id: corvus-cstar-proof
    category: corvus
    topic: "CStar as sovereign agent runtime — existing proof points"
    status: active
    notes: |
      CStar already has:
      - host-native supervisor model
      - bead-driven decision record (audit trail)
      - Hall of Records (long-term memory, stays in Canada)
      - Linscott Standard verification (deterministic governance)
      - Gemini + Codex distribution surfaces
      These are the sovereign execution layer. The model is the missing piece.
    sources: []

  - id: corvus-distribution-sync
    category: corvus
    topic: "Gemini + Codex distribution surfaces alignment"
    status: active
    notes: |
      The epic-host-native-runtime-migration bead (CStar Evolution)
      will align Gemini and Codex host surfaces with the new
      host-native model. This ensures Corvus speaks with one voice
      across host surfaces when the moonshot launches externally.
    sources: []

# ============================================================
# FUNDING PRIORITY SEQUENCE
# ============================================================
#
# The order to pursue funding vehicles — earliest first.
# SR&ED requires only code (no grant application). Start there.
#
# ============================================================

funding_sequence:
  - step: 1
    vehicle: "SR&ED"
    description: |
      CStar's novel architecture (host-native runtime, bead memory system,
      Gungnir scoring, Linscott Standard) is likely claimable as
      scientific research. File immediately. Low overhead, no committee.
    action: "Craig prepares SR&ED claim for current CStar development"
    status: todo

  - step: 2
    vehicle: "ISED IRAP"
    description: |
      Innovation, Research, Aerospace, Defence. Dual-use AI for
      national sovereignty fits. Gary's relationships likely
      open the door here. Requires a concept brief.
    action: "Draft 5-page sovereign AI concept brief. Gary delivers."
    status: todo

  - step: 3
    vehicle: "NRC AI Sovereignty Programme"
    description: |
      NRC has signalled interest in Canadian AI independence.
      Corvus as the agentic infrastructure layer + Canadian model
      as the intelligence layer maps to an NRC engagement.
    action: "Gary initiates NRC conversation with concept brief in hand"
    status: todo

  - step: 4
    vehicle: "Provincial — Ontario OCE or Quebec MEI"
    description: |
      Ontario and Quebec both have AI strategy funding vehicles.
      A healthcare or legal pilot with a named institution
      changes the pitch entirely.
    action: "Identify one landing customer in regulated sector (healthcare/legal)"
    status: todo

  - step: 5
    vehicle: "Scale AI / CAAAIS"
    description: |
      Scale AI focuses on supply chain but has AI-adjacent streams.
      CAAAIS is advisory, not a funding body — but shapes the narrative.
    action: "Map to broader Canadian AI strategy narrative"
    status: todo

# ============================================================
# BRIEF — THE ONE-PAGER
# ============================================================
#
# A 5-page concept brief that Craig can leave with someone at
# ISED, a defence contractor, or a provincial health authority.
# NOT a pitch deck. A concept document that names the problem,
# the architecture, the sovereign compute, and the first step.
#
# ============================================================

brief:
  draft_status: pending
  target_length: "5 pages"
  intended_audience: |
    ISED officials, defence procurement, provincial health IT,
    NRC program officers
  structure:
    - section: "The Problem"
      content: |
        Canada lacks sovereign AI infrastructure. Sensitive sectors —
        healthcare, legal, government — depend on foreign AI systems
        that are subject to foreign law, foreign access, and foreign
        cut-off risk. PIPEDA and provincial health acts require data
        residency. No Canadian sovereign AI stack exists.
    - section: "The Architecture"
      content: |
        Corvus Star (CStar) is a sovereign agent runtime built in
        Canada, by Canadians. It provides: host-native supervision,
        bead-driven decision records (audit trail), Hall of Records
        (long-term memory on Canadian infrastructure), and Linscott
        Standard verification (deterministic governance). It runs on
        Canadian compute today.
    - section: "The Missing Piece"
      content: |
        The intelligence layer. A Canadian foundation model grounded
        in Canadian law, healthcare, government, and both official
        languages — fine-tuned on Canadian data, governed by
        Canadian law, deployed on Canadian infrastructure.
    - section: "The First Step"
      content: |
        Fine-tune an open-weight model on a Canadian corpus using
        the DGX Spark. Demonstrate sovereign inference. Prove the
        architecture works end-to-end before the full model run.
    - section: "Team"
      content: |
        Craig Linscott — Lead Developer, Corvus Star
        Gary Linscott — Lead Advisor, Federal/Provincial Relations
