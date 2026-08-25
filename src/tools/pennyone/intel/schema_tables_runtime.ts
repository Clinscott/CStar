export const HALL_SCHEMA_RUNTIME_SQL = String.raw`
        CREATE TABLE IF NOT EXISTS hall_skill_proposals (
            proposal_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            bead_id TEXT,
            validation_id TEXT,
            target_path TEXT,
            contract_path TEXT,
            proposal_path TEXT,
            status TEXT NOT NULL,
            summary TEXT,
            promotion_note TEXT,
            promoted_at INTEGER,
            promoted_by TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            metadata_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id),
            FOREIGN KEY(validation_id) REFERENCES hall_validation_runs(validation_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_skill_proposals_repo
        ON hall_skill_proposals(repo_id, created_at);

        CREATE TABLE IF NOT EXISTS hall_planning_sessions (
            session_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            status TEXT NOT NULL,
            user_intent TEXT NOT NULL,
            normalized_intent TEXT NOT NULL,
            summary TEXT,
            latest_question TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            metadata_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_planning_repo
        ON hall_planning_sessions(repo_id, updated_at);

        CREATE TABLE IF NOT EXISTS hall_one_mind_broker (
            repo_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            binding_state TEXT NOT NULL,
            fulfillment_ready INTEGER NOT NULL DEFAULT 0,
            provider TEXT,
            session_id TEXT,
            control_plane TEXT NOT NULL,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE TABLE IF NOT EXISTS hall_one_mind_requests (
            request_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            caller_source TEXT NOT NULL,
            boundary TEXT NOT NULL,
            request_status TEXT NOT NULL,
            transport_preference TEXT,
            prompt TEXT NOT NULL,
            system_prompt TEXT,
            response_text TEXT,
            error_text TEXT,
            lease_owner TEXT,
            claimed_at INTEGER,
            completed_at INTEGER,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_one_mind_requests_repo_status
        ON hall_one_mind_requests(repo_id, request_status, created_at);

        CREATE TABLE IF NOT EXISTS hall_one_mind_branches (
            branch_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            source_weave TEXT NOT NULL,
            branch_group_id TEXT NOT NULL,
            branch_kind TEXT NOT NULL,
            branch_label TEXT NOT NULL,
            branch_index INTEGER NOT NULL,
            status TEXT NOT NULL,
            provider TEXT,
            session_id TEXT,
            trace_id TEXT,
            parent_request_id TEXT,
            summary TEXT,
            error_text TEXT,
            artifacts_json TEXT,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(parent_request_id) REFERENCES hall_one_mind_requests(request_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_one_mind_branches_repo_group
        ON hall_one_mind_branches(repo_id, branch_group_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_hall_one_mind_branches_trace
        ON hall_one_mind_branches(repo_id, trace_id, created_at);

        CREATE TABLE IF NOT EXISTS hall_agent_presence (
            repo_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            current_task TEXT,
            active_bead_id TEXT,
            session_id TEXT,
            trace_id TEXT,
            target_path TEXT,
            watch_paths_json TEXT,
            pid INTEGER,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(repo_id, agent_id),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_agent_presence_repo_status
        ON hall_agent_presence(repo_id, status, updated_at);

        CREATE INDEX IF NOT EXISTS idx_hall_agent_presence_repo_bead
        ON hall_agent_presence(repo_id, active_bead_id, updated_at);

        CREATE TABLE IF NOT EXISTS hall_coordination_events (
            event_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            scope_kind TEXT NOT NULL,
            scope_ref TEXT NOT NULL,
            event_kind TEXT NOT NULL,
            from_agent_id TEXT NOT NULL,
            to_agent_id TEXT,
            session_id TEXT,
            trace_id TEXT,
            bead_id TEXT,
            target_path TEXT,
            rationale TEXT NOT NULL,
            summary TEXT NOT NULL,
            payload_json TEXT,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_coordination_events_repo_thread
        ON hall_coordination_events(repo_id, thread_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_hall_coordination_events_repo_scope
        ON hall_coordination_events(repo_id, scope_kind, scope_ref, created_at);

        CREATE INDEX IF NOT EXISTS idx_hall_coordination_events_repo_bead
        ON hall_coordination_events(repo_id, bead_id, created_at);

        CREATE TABLE IF NOT EXISTS hall_git_commits (
            commit_hash TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            author_name TEXT,
            author_email TEXT,
            authored_at INTEGER NOT NULL,
            committer_name TEXT,
            committer_email TEXT,
            committed_at INTEGER NOT NULL,
            message TEXT,
            parent_hashes_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_git_commits_repo_date ON hall_git_commits(repo_id, committed_at);

        CREATE TABLE IF NOT EXISTS hall_git_diffs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            commit_hash TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            change_type TEXT NOT NULL,
            old_path TEXT,
            insertions INTEGER DEFAULT 0,
            deletions INTEGER DEFAULT 0,
            patch_text TEXT,
            FOREIGN KEY(commit_hash) REFERENCES hall_git_commits(commit_hash),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_git_diffs_commit ON hall_git_diffs(commit_hash);
        CREATE INDEX IF NOT EXISTS idx_hall_git_diffs_file ON hall_git_diffs(repo_id, file_path);

        CREATE TABLE IF NOT EXISTS hall_documents (
            document_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            root_path TEXT NOT NULL,
            path TEXT NOT NULL,
            title TEXT NOT NULL,
            doc_kind TEXT NOT NULL,
            status TEXT NOT NULL,
            latest_version_id TEXT NOT NULL,
            latest_content_hash TEXT NOT NULL,
            latest_summary TEXT,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(repo_id, path),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_documents_repo_path ON hall_documents(repo_id, path);

        CREATE TABLE IF NOT EXISTS hall_document_versions (
            version_id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT,
            content TEXT NOT NULL,
            source_label TEXT,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(document_id) REFERENCES hall_documents(document_id),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_document_versions_document ON hall_document_versions(document_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS hall_mounted_spokes (
            spoke_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            slug TEXT NOT NULL,
            kind TEXT NOT NULL,
            root_path TEXT NOT NULL,
            remote_url TEXT,
            default_branch TEXT,
            mount_status TEXT NOT NULL,
            trust_level TEXT NOT NULL,
            write_policy TEXT NOT NULL,
            projection_status TEXT NOT NULL,
            last_scan_at INTEGER,
            last_health_at INTEGER,
            last_health_attempt_at INTEGER,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(repo_id, slug),
            UNIQUE(repo_id, root_path),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_mounted_spokes_repo
        ON hall_mounted_spokes(repo_id, slug);

`;
