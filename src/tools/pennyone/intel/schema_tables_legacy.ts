export const HALL_SCHEMA_LEGACY_SQL = String.raw`
        CREATE TABLE IF NOT EXISTS spokes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS norn_beads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT,
            status TEXT,
            agent_id TEXT,
            assigned_raven TEXT,
            timestamp INTEGER
        );

        CREATE TABLE IF NOT EXISTS mission_traces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mission_id TEXT,
            file_path TEXT,
            target_metric TEXT,
            initial_score REAL,
            final_score REAL,
            justification TEXT,
            status TEXT,
            timestamp INTEGER
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            spoke_id INTEGER NOT NULL,
            start_timestamp INTEGER NOT NULL,
            end_timestamp INTEGER,
            total_pings INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(spoke_id) REFERENCES spokes(id)
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_spoke_time
        ON sessions(spoke_id, start_timestamp DESC);

        CREATE TABLE IF NOT EXISTS pings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            agent_id TEXT NOT NULL,
            action TEXT NOT NULL,
            target_path TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        );

        CREATE INDEX IF NOT EXISTS idx_pings_session_time
        ON pings(session_id, timestamp ASC);

        CREATE INDEX IF NOT EXISTS idx_pings_target_time
        ON pings(target_path, timestamp DESC);

        CREATE VIRTUAL TABLE IF NOT EXISTS intents_fts USING fts5(
            path UNINDEXED,
            intent,
            interaction_protocol
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS chronicles_fts USING fts5(
            source_file UNINDEXED,
            header,
            content,
            timestamp UNINDEXED
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS hall_documents_fts USING fts5(
            path UNINDEXED,
            title,
            summary,
            content
        );

        -- BEAD-CSTAR-WAR-GAME-SCORING-001 — war-game arbitration tables.
        -- The kernel scores attacker-vs-defender Engram conversations without
        -- trusting either combatant's self-report. See docs/beads/cstar-war-game-scoring-001.md.

        CREATE TABLE IF NOT EXISTS war_game_contests (
            contest_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            contest_name TEXT NOT NULL,
            attacker_label TEXT NOT NULL,
            defender_label TEXT NOT NULL,
            attacker_bead_id TEXT,
            defender_bead_id TEXT,
            attacker_intent_prefix TEXT NOT NULL,
            defender_intent_prefix TEXT NOT NULL,
            shot_id_path TEXT NOT NULL DEFAULT 'metadata.shot_id',
            expected_path TEXT NOT NULL DEFAULT 'metadata.expected',
            terminal_event_path TEXT NOT NULL DEFAULT 'metadata.terminal_event',
            terminal_event_class_map_json TEXT NOT NULL,
            scenario_compatibility_map_json TEXT NOT NULL,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_war_game_contests_repo
            ON war_game_contests(repo_id);
        CREATE INDEX IF NOT EXISTS idx_war_game_contests_defender_prefix
            ON war_game_contests(defender_intent_prefix);

        CREATE TABLE IF NOT EXISTS war_game_scores (
            score_id TEXT PRIMARY KEY,
            contest_id TEXT NOT NULL,
            shot_id TEXT NOT NULL,
            scenario_id TEXT NOT NULL,
            outcome TEXT NOT NULL,
            expected_summary TEXT,
            observed_terminal_event TEXT,
            inconclusive_reason TEXT,
            attacker_engram_intent TEXT NOT NULL,
            defender_engram_intent TEXT NOT NULL,
            scored_at INTEGER NOT NULL,
            UNIQUE(contest_id, shot_id),
            FOREIGN KEY(contest_id) REFERENCES war_game_contests(contest_id)
        );

        CREATE INDEX IF NOT EXISTS idx_war_game_scores_contest
            ON war_game_scores(contest_id, scored_at);
        CREATE INDEX IF NOT EXISTS idx_war_game_scores_outcome
            ON war_game_scores(contest_id, outcome);
        CREATE INDEX IF NOT EXISTS idx_war_game_scores_shot
            ON war_game_scores(shot_id);

`;

