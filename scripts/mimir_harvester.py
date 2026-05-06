import os
import sqlite3
import json
import uuid
import sys
import argparse
from datetime import datetime

# [Ω] MIMIR HARVESTER
# Purpose: Autonomous study of episodic memory engrams and tree consolidation.
# Mandate: "Isolated Insights, Traceable Roots."

class MimirHarvester:
    def __init__(self, db_path, project_root):
        self.db_path = db_path
        self.project_root = project_root
        self.conn = sqlite3.connect(db_path)
        self.cur = self.conn.cursor()

    def find_unstudied_engrams(self, sessions_only=True):
        """Find engrams that don't have associated lessons yet."""
        filter_clause = "WHERE memory_id LIKE 'engram_session_%'" if sessions_only else ""
        query = f"""
            SELECT memory_id 
            FROM hall_episodic_memory 
            {filter_clause}
            {"AND" if sessions_only else "WHERE"} memory_id NOT IN (SELECT DISTINCT memory_id FROM hall_lessons WHERE memory_id IS NOT NULL)
            ORDER BY created_at ASC
        """
        self.cur.execute(query)
        return [row[0] for row in self.cur.fetchall()]

    def get_or_create_node(self, repo_id, level, title, parent_id=None, content=""):
        """Find an existing node by title/level or create a new one."""
        self.cur.execute(
            "SELECT lesson_id FROM hall_lessons WHERE repo_id = ? AND level = ? AND title = ?",
            (repo_id, level, title)
        )
        row = self.cur.fetchone()
        if row:
            return row[0]
        
        lesson_id = f"lesson:{uuid.uuid4().hex[:8]}"
        now = int(datetime.now().timestamp() * 1000)
        self.cur.execute(
            """INSERT INTO hall_lessons 
               (lesson_id, parent_lesson_id, repo_id, level, title, content, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (lesson_id, parent_id, repo_id, level, title, content, now, now)
        )
        return lesson_id

    def harvest(self, limit=5):
        unstudied = self.find_unstudied_engrams()
        if not unstudied:
            print("[INFO] No new engrams to harvest.")
            return

        print(f"[INFO] Found {len(unstudied)} unstudied engrams. Harvesting top {limit}...")
        
        # In a real CStar skill, we would invoke the weave:distill-lessons via MCP or RPC.
        # For this implementation, we provide the framework for the agent to call the weave
        # for each item and then use this script to consolidate.
        
        for mid, summary in unstudied[:limit]:
            print(f"◈ Proposed for study: {mid}")
            # The agent (caller) will handle the actual LLM call via the weave.

    def consolidate_lessons(self, memory_id, repo_id, nodes):
        """
        Consolidate a batch of distilled nodes into the existing tree.
        'nodes' is a list of dicts: {'level': '...', 'title': '...', 'content': '...', 'parent_title': '...'}
        """
        title_to_id = {}
        lessons_created = 0
        
        # Sort nodes by level importance or dependency (though parent_title is better)
        # Process TREE first, then LIMB, etc.
        level_order = ["TREE", "LIMB", "BRANCH", "LEAF", "CELL"]
        sorted_nodes = sorted(nodes, key=lambda x: level_order.index(x['level']))

        for node in sorted_nodes:
            parent_id = None
            if 'parent_title' in node and node['parent_title']:
                parent_id = title_to_id.get(node['parent_title'])
                # If not in current batch, check DB
                if not parent_id:
                    self.cur.execute(
                        "SELECT lesson_id FROM hall_lessons WHERE repo_id = ? AND title = ?",
                        (repo_id, node['parent_title'])
                    )
                    row = self.cur.fetchone()
                    if row:
                        parent_id = row[0]

            lid = self.get_or_create_node(
                repo_id, 
                node['level'], 
                node['title'], 
                parent_id, 
                node.get('content', '')
            )
            
            # Associate this memory with the node if it's a LEAF or CELL
            if node['level'] in ['LEAF', 'CELL']:
                self.cur.execute(
                    "UPDATE hall_lessons SET memory_id = ? WHERE lesson_id = ?",
                    (memory_id, lid)
                )
            
            title_to_id[node['title']] = lid
            lessons_created += 1
            
        self.conn.commit()
        return lessons_created

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mimir Harvester: Study and record memory engrams.")
    parser.add_argument("--db", required=True, help="Path to pennyone.db")
    parser.add_argument("--root", required=True, help="Project root")
    parser.add_argument("--action", choices=["find", "consolidate"], default="find")
    parser.add_argument("--memory-id", help="Memory ID for consolidation")
    parser.add_argument("--repo-id", help="Repo ID for consolidation")
    parser.add_argument("--nodes-json", help="JSON string of distilled nodes")
    
    args = parser.parse_args()
    harvester = MimirHarvester(args.db, args.root)
    
    if args.action == "find":
        ids = harvester.find_unstudied_engrams()
        print(json.dumps(ids))
    elif args.action == "consolidate":
        if not args.memory_id or not args.repo_id or not args.nodes_json:
            print("[ERROR] Missing parameters for consolidation.")
            sys.exit(1)
        nodes = json.loads(args.nodes_json)
        count = harvester.consolidate_lessons(args.memory_id, args.repo_id, nodes)
        print(f"Successfully consolidated {count} lessons.")
