import Database from 'better-sqlite3';
import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';

export interface HallLessonRecord {
    lesson_id: string;
    parent_lesson_id?: string;
    repo_id: string;
    memory_id?: string;
    level: 'TREE' | 'LIMB' | 'BRANCH' | 'LEAF' | 'CELL';
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export function saveHallLesson(record: HallLessonRecord): void {
    const db = database.getDb();
    const sql = `
        INSERT INTO hall_lessons (
            lesson_id, parent_lesson_id, repo_id, memory_id,
            level, title, content, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(lesson_id) DO UPDATE SET
            parent_lesson_id = excluded.parent_lesson_id,
            level = excluded.level,
            title = excluded.title,
            content = excluded.content,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `;
    db.prepare(sql).run(
        record.lesson_id,
        record.parent_lesson_id || null,
        record.repo_id,
        record.memory_id || null,
        record.level,
        record.title,
        record.content,
        stringifyJson(record.metadata),
        record.created_at,
        record.updated_at
    );
}

export function getHallLesson(lessonId: string): HallLessonRecord | null {
    const db = database.getDb();
    const row = db.prepare('SELECT * FROM hall_lessons WHERE lesson_id = ?').get(lessonId) as any;
    if (!row) return null;
    return {
        ...row,
        metadata: parseJson(row.metadata_json, {})
    };
}

export function listHallLessons(repoId?: string, level?: string): HallLessonRecord[] {
    const db = database.getDb();
    let sql = 'SELECT * FROM hall_lessons';
    const params: any[] = [];
    
    if (repoId || level) {
        sql += ' WHERE ';
        const parts = [];
        if (repoId) {
            parts.push('repo_id = ?');
            params.push(repoId);
        }
        if (level) {
            parts.push('level = ?');
            params.push(level);
        }
        sql += parts.join(' AND ');
    }
    
    sql += ' ORDER BY created_at DESC';
    
    return (db.prepare(sql).all(...params) as any[]).map(row => ({
        ...row,
        metadata: parseJson(row.metadata_json, {})
    }));
}

export function getLessonTree(rootLessonId: string): HallLessonRecord[] {
    const db = database.getDb();
    // Simple recursive-like fetch (SQLite doesn't support CTEs in all versions/drivers without complexity)
    // For now, we'll do a flat list and let the caller reconstruct if needed, or just return all descendants.
    const descendants: HallLessonRecord[] = [];
    const queue = [rootLessonId];
    
    while (queue.length > 0) {
        const parentId = queue.shift()!;
        const children = db.prepare('SELECT * FROM hall_lessons WHERE parent_lesson_id = ?').all(parentId) as any[];
        for (const child of children) {
            const record = {
                ...child,
                metadata: parseJson(child.metadata_json, {})
            };
            descendants.push(record);
            queue.push(record.lesson_id);
        }
    }
    
    return descendants;
}
