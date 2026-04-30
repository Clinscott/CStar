import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nRECENT GIT COMMITS IN HALL:");
const commits = db.prepare("SELECT commit_hash, author_name, message, committed_at FROM hall_git_commits ORDER BY committed_at DESC LIMIT 5").all();
console.log(commits);

console.log("\nGIT DIFFS COUNT:");
const diffs = db.prepare("SELECT COUNT(*) as count FROM hall_git_diffs").get();
console.log(diffs);

db.close();
