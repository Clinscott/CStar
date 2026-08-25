export const HALL_SCHEMA_CORE_SQL = String.raw`
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS hall_repositories (
            repo_id TEXT PRIMARY KEY,
            root_path TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'DORMANT',
            active_persona TEXT NOT NULL DEFAULT '',
            baseline_gungnir_score REAL NOT NULL DEFAULT 0,
            intent_integrity REAL NOT NULL DEFAULT 0,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS hall_scans (
            scan_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            scan_kind TEXT NOT NULL,
            status TEXT NOT NULL,
            baseline_gungnir_score REAL NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            metadata_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_scans_repo ON hall_scans(repo_id);

        CREATE TABLE IF NOT EXISTS hall_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id TEXT NOT NULL,
            scan_id TEXT NOT NULL,
            path TEXT NOT NULL,
            content_hash TEXT,
            language TEXT,
            gungnir_score REAL NOT NULL DEFAULT 0,
            matrix_json TEXT,
            imports_json TEXT,
            exports_json TEXT,
            intent_summary TEXT,
            interaction_summary TEXT,
            created_at INTEGER NOT NULL,
            UNIQUE(scan_id, path),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_files_repo_path ON hall_files(repo_id, path);

        CREATE TABLE IF NOT EXISTS hall_episodic_memory (
            memory_id TEXT PRIMARY KEY,
            bead_id TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            tactical_summary TEXT NOT NULL,
            files_touched_json TEXT,
            successes_json TEXT,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_episodic_memory_repo ON hall_episodic_memory(repo_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_hall_episodic_memory_bead ON hall_episodic_memory(bead_id, created_at);

        CREATE TABLE IF NOT EXISTS hall_lessons (
            lesson_id TEXT PRIMARY KEY,
            parent_lesson_id TEXT,
            repo_id TEXT NOT NULL,
            memory_id TEXT,
            level TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(memory_id) REFERENCES hall_episodic_memory(memory_id),
            FOREIGN KEY(parent_lesson_id) REFERENCES hall_lessons(lesson_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_lessons_repo ON hall_lessons(repo_id);
        CREATE INDEX IF NOT EXISTS idx_hall_lessons_parent ON hall_lessons(parent_lesson_id);
        CREATE INDEX IF NOT EXISTS idx_hall_lessons_memory ON hall_lessons(memory_id);

        CREATE VIRTUAL TABLE IF NOT EXISTS hall_lessons_fts USING fts5(
            lesson_id UNINDEXED,
            level,
            title,
            content,
            content='hall_lessons',
            content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS hall_lessons_ai AFTER INSERT ON hall_lessons BEGIN
            INSERT INTO hall_lessons_fts(rowid, lesson_id, level, title, content)
            VALUES (new.rowid, new.lesson_id, new.level, new.title, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS hall_lessons_ad AFTER DELETE ON hall_lessons BEGIN
            INSERT INTO hall_lessons_fts(hall_lessons_fts, rowid, lesson_id, level, title, content)
            VALUES('delete', old.rowid, old.lesson_id, old.level, old.title, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS hall_lessons_au AFTER UPDATE ON hall_lessons BEGIN
            INSERT INTO hall_lessons_fts(hall_lessons_fts, rowid, lesson_id, level, title, content)
            VALUES('delete', old.rowid, old.lesson_id, old.level, old.title, old.content);
            INSERT INTO hall_lessons_fts(rowid, lesson_id, level, title, content)
            VALUES (new.rowid, new.lesson_id, new.level, new.title, new.content);
        END;

        CREATE VIRTUAL TABLE IF NOT EXISTS hall_episodic_fts USING fts5(
            memory_id UNINDEXED,
            tactical_summary,
            metadata_json,
            content='hall_episodic_memory',
            content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS hall_episodic_memory_ai AFTER INSERT ON hall_episodic_memory BEGIN
            INSERT INTO hall_episodic_fts(rowid, memory_id, tactical_summary, metadata_json)
            VALUES (new.rowid, new.memory_id, new.tactical_summary, new.metadata_json);
        END;

        CREATE TRIGGER IF NOT EXISTS hall_episodic_memory_ad AFTER DELETE ON hall_episodic_memory BEGIN
            INSERT INTO hall_episodic_fts(hall_episodic_fts, rowid, memory_id, tactical_summary, metadata_json)
            VALUES('delete', old.rowid, old.memory_id, old.tactical_summary, old.metadata_json);
        END;

        CREATE TRIGGER IF NOT EXISTS hall_episodic_memory_au AFTER UPDATE ON hall_episodic_memory BEGIN
            INSERT INTO hall_episodic_fts(hall_episodic_fts, rowid, memory_id, tactical_summary, metadata_json)
            VALUES('delete', old.rowid, old.memory_id, old.tactical_summary, old.metadata_json);
            INSERT INTO hall_episodic_fts(rowid, memory_id, tactical_summary, metadata_json)
            VALUES (new.rowid, new.memory_id, new.tactical_summary, new.metadata_json);
        END;

        CREATE TABLE IF NOT EXISTS hall_beads (
            bead_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            scan_id TEXT,
            legacy_id INTEGER,
            target_kind TEXT NOT NULL DEFAULT 'FILE',
            target_ref TEXT,
            target_path TEXT,
            rationale TEXT NOT NULL,
            contract_refs_json TEXT,
            baseline_scores_json TEXT,
            acceptance_criteria TEXT,
            checker_shell TEXT,
            status TEXT NOT NULL DEFAULT 'OPEN',
            assigned_agent TEXT,
            source_kind TEXT,
            triage_reason TEXT,
            resolution_note TEXT,
            resolved_validation_id TEXT,
            superseded_by TEXT,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(repo_id, legacy_id),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_beads_repo_status ON hall_beads(repo_id, status);

        CREATE TABLE IF NOT EXISTS hall_forge_requests (
            request_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            bead_id TEXT NOT NULL,
            decision_id TEXT NOT NULL,
            operator_authorization_ref TEXT,
            operator_thread_id TEXT,
            operator_turn_id TEXT,
            operator_message_sha256 TEXT,
            operator_record_sha256 TEXT,
            operator_record_set_sha256 TEXT,
            operator_record_count INTEGER CHECK(operator_record_count IS NULL OR operator_record_count >= 1),
            requester_thread_id TEXT,
            requester_turn_id TEXT,
            requester_record_set_sha256 TEXT,
            authorization_profile TEXT,
            authorization_challenge_sha256 TEXT,
            request_sha256 TEXT NOT NULL,
            request_summary_json TEXT NOT NULL,
            adapter_ref TEXT,
            write_capability TEXT CHECK(write_capability IN ('response_only', 'project_files')),
            target_paths_sha256 TEXT NOT NULL,
            live_source_allowed INTEGER NOT NULL CHECK(live_source_allowed IN (0, 1)),
            max_attempts INTEGER NOT NULL CHECK(max_attempts >= 1 AND max_attempts <= 10),
            status TEXT NOT NULL CHECK(status IN ('PENDING_AUTH', 'AUTHORIZED', 'SUCCEEDED', 'FAILED_FINAL', 'EXHAUSTED', 'AMBIGUOUS', 'REVOKED')),
            active_attempt_id TEXT,
            authorized_at INTEGER,
            expires_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            completed_at INTEGER,
            UNIQUE(bead_id, decision_id),
            UNIQUE(operator_authorization_ref),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_forge_requests_bead_status
        ON hall_forge_requests(bead_id, status, created_at);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_hall_forge_requests_one_shot_authorization
        ON hall_forge_requests(operator_authorization_ref);

        CREATE TABLE IF NOT EXISTS hall_forge_authorizations (
            authorization_id TEXT PRIMARY KEY,
            request_id TEXT NOT NULL UNIQUE,
            request_sha256 TEXT NOT NULL,
            authorization_profile TEXT NOT NULL CHECK(authorization_profile = 'exact_request_challenge_v1'),
            challenge_sha256 TEXT NOT NULL,
            operator_authorization_ref TEXT NOT NULL UNIQUE,
            operator_thread_id TEXT NOT NULL,
            operator_turn_id TEXT NOT NULL,
            operator_message_sha256 TEXT NOT NULL,
            operator_record_sha256 TEXT NOT NULL,
            operator_record_set_sha256 TEXT NOT NULL,
            operator_record_count INTEGER NOT NULL CHECK(operator_record_count = 1),
            execution_grant_schema TEXT,
            execution_grant_sha256 TEXT,
            execution_grant_json TEXT,
            authorized_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(operator_thread_id, operator_turn_id),
            FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id)
        );

        CREATE TABLE IF NOT EXISTS hall_forge_attempts (
            attempt_id TEXT PRIMARY KEY,
            request_id TEXT NOT NULL,
            ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
            idempotency_key TEXT NOT NULL,
            execution_receipt_id TEXT NOT NULL UNIQUE,
            adapter_ref TEXT NOT NULL,
            provider TEXT,
            requested_model TEXT,
            actual_model TEXT,
            model_source TEXT,
            reasoning_profile TEXT,
            adapter_version TEXT,
            status TEXT NOT NULL CHECK(status IN ('RESERVED', 'STARTED', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'UNKNOWN')),
            retry_of_attempt_id TEXT,
            external_execution_id TEXT,
            result_status TEXT,
            result_artifact_sha256 TEXT,
            error_code TEXT,
            validation_id TEXT,
            validation_verdict TEXT,
            validation_notes_sha256 TEXT,
            reserved_at INTEGER NOT NULL,
            spawn_started_at INTEGER,
            completed_at INTEGER,
            updated_at INTEGER NOT NULL,
            UNIQUE(request_id, ordinal),
            UNIQUE(request_id, idempotency_key),
            UNIQUE(request_id, attempt_id),
            FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id),
            FOREIGN KEY(request_id, retry_of_attempt_id) REFERENCES hall_forge_attempts(request_id, attempt_id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_hall_forge_attempts_one_active
        ON hall_forge_attempts(request_id)
        WHERE status IN ('RESERVED', 'STARTED', 'UNKNOWN');

        CREATE UNIQUE INDEX IF NOT EXISTS idx_hall_forge_attempts_external_execution
        ON hall_forge_attempts(adapter_ref, external_execution_id)
        WHERE external_execution_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS hall_bead_critiques (
            critique_id TEXT PRIMARY KEY,
            bead_id TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            agent_expertise TEXT NOT NULL,
            critique TEXT NOT NULL,
            proposed_path TEXT NOT NULL,
            evidence_json TEXT NOT NULL,
            is_architect_approved INTEGER NOT NULL DEFAULT 0,
            architect_feedback TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_critiques_bead ON hall_bead_critiques(bead_id);

        CREATE TABLE IF NOT EXISTS hall_validation_runs (
            validation_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            scan_id TEXT,
            bead_id TEXT,
            target_path TEXT,
            verdict TEXT NOT NULL,
            sprt_verdict TEXT,
            pre_scores_json TEXT,
            post_scores_json TEXT,
            benchmark_json TEXT,
            notes TEXT,
            authority_class TEXT NOT NULL DEFAULT 'legacy_unverified',
            evidence_sha256 TEXT,
            validator_identity TEXT,
            validator_identity_source TEXT,
            evidence_manifest_json TEXT,
            created_at INTEGER NOT NULL,
            legacy_trace_id INTEGER,
            UNIQUE(repo_id, legacy_trace_id),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id),
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_validation_repo ON hall_validation_runs(repo_id, created_at);

        CREATE TABLE IF NOT EXISTS hall_skill_observations (
            observation_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            outcome TEXT NOT NULL,
            observation TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            metadata_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE TABLE IF NOT EXISTS hall_skill_activations (
            activation_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            bead_id TEXT,
            session_id TEXT,
            skill_id TEXT NOT NULL,
            adapter_id TEXT,
            role TEXT,
            status TEXT NOT NULL,
            intent TEXT NOT NULL,
            target_path TEXT,
            payload_json TEXT,
            result_summary TEXT,
            error_text TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            completed_at INTEGER,
            metadata_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id),
            FOREIGN KEY(session_id) REFERENCES hall_planning_sessions(session_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_skill_activations_repo_status
        ON hall_skill_activations(repo_id, status, created_at);

`;
