import { join } from 'node:path';
import fs from 'node:fs';
import { 
    upsertHallBead, 
    getHallBead, 
    getBeadCount, 
    getHallBeads,
    getHallBeadsByStatus,
    getHallBeadsBySource,
    getHallBeadsByEpic,
    deleteHallBead,
    upsertBeadCritique,
    getBeadCritiques,
    getEpisodicMemory,
    getEpisodicMemoryById,
    saveEpisodicMemory,
    getValidationRuns,
    getTracesForFile,
    saveValidationRun,
    saveTrace
} from './bead_controller.js';
import { 
    getHallPlanningSession, 
    saveHallPlanningSession, 
    listHallPlanningSessions,
    saveHallSkillProposal,
    getHallSkillProposal,
    listHallSkillProposals,
    getSessionsWithSummaries as getRecentAgentPings,
    registerSpoke,
    saveHallSkillObservation,
    savePing,
    getSessionPings,
    getRecentSessions,
    getPingsForSession
} from './session_manager.js';
import { 
    getHallRepositoryRecord, 
    upsertHallRepository, 
    recordHallScan,
    getHallFileByPath,
    recordHallFile,
    getHallFiles,
    getLatestHallScanId,
    saveHallGitCommit,
    saveHallGitDiff,
    getHallGitHistory,
    acquireLease,
    releaseLease,
    getHallMountedSpoke,
    listHallMountedSpokes,
    saveHallMountedSpoke,
    removeHallMountedSpoke,
    migrateLegacyHallRecords,
    getHallSummary,
    updateFtsIndex,
    updateChronicleIndex,
    searchIntents as searchHallFiles
} from './repository_manager.js';
import { ensureHallSchema } from './schema.js';
import Database from 'better-sqlite3';
import { registry } from '../pathRegistry.js';

export class HallDatabase {
    private dbs: Map<string, Database.Database> = new Map();

    public getDb(rootPath: string = registry.getRoot()): Database.Database {
        const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
        if (this.dbs.has(normalizedRoot)) {
            return this.dbs.get(normalizedRoot)!;
        }

        const statsDir = join(rootPath, '.stats');
        if (!fs.existsSync(statsDir)) {
            fs.mkdirSync(statsDir, { recursive: true });
        }
        const dbPath = join(statsDir, 'pennyone.db');
        const db = new Database(dbPath);
        this.dbs.set(normalizedRoot, db);
        
        ensureHallSchema(db, rootPath);
        
        return db;
    }

    public close(): void {
        for (const db of this.dbs.values()) {
            db.close();
        }
        this.dbs.clear();
    }

    // Facade Methods
    public upsertHallBead = upsertHallBead;
    public getHallBead = getHallBead;
    public getBeadCount = getBeadCount;
    public getHallBeads = getHallBeads;
    public getHallBeadsByStatus = getHallBeadsByStatus;
    public getHallBeadsBySource = getHallBeadsBySource;
    public getHallBeadsByEpic = getHallBeadsByEpic;
    public deleteHallBead = deleteHallBead;
    public upsertBeadCritique = upsertBeadCritique;
    public getBeadCritiques = getBeadCritiques;
    public getEpisodicMemory = getEpisodicMemory;
    public saveEpisodicMemory = saveEpisodicMemory;
    public getValidationRuns = getValidationRuns;
    public saveValidationRun = saveValidationRun;
    public getHallPlanningSession = getHallPlanningSession;
    public saveHallPlanningSession = saveHallPlanningSession;
    public listHallPlanningSessions = listHallPlanningSessions;
    public saveHallSkillProposal = saveHallSkillProposal;
    public listHallSkillProposals = listHallSkillProposals;
    public getHallSkillProposal = getHallSkillProposal;
    public getRecentAgentPings = getRecentAgentPings;
    public registerSpoke = registerSpoke;
    public saveHallSkillObservation = saveHallSkillObservation;
    public getHallRepository = getHallRepositoryRecord;
    public saveHallRepository = upsertHallRepository;
    public saveHallScan = recordHallScan;
    public getHallFile = getHallFileByPath;
    public saveHallFile = recordHallFile;
    public getHallFiles = getHallFiles;
    public getLatestHallScanId = getLatestHallScanId;
    public saveHallGitHistory = saveHallGitCommit;
    public saveHallGitDiff = saveHallGitDiff;
    public acquireHallLease = acquireLease;
    public releaseHallLease = releaseLease;
    public getHallMountedSpoke = getHallMountedSpoke;
    public listHallMountedSpokes = listHallMountedSpokes;
    public saveHallMountedSpoke = saveHallMountedSpoke;
    public getHallSummary = getHallSummary;
    public updateFtsIndex = updateFtsIndex;
    public updateChronicleIndex = updateChronicleIndex;
    public searchHallFiles = searchHallFiles;
    public searchIntents = searchHallFiles;
}

export const database = new HallDatabase();

/**
 * [Ω] STANDALONE DB ACCESS (Legacy/Facade)
 * Returns the global database instance for a given root path.
 */
export function getDb(rootPath: string = registry.getRoot()): Database.Database {
    return database.getDb(rootPath);
}

/**
 * [Ω] STANDALONE DB DISPOSAL (Legacy/Facade)
 * Closes the global database instance.
 */
export function closeDb(): void {
    database.close();
}

// Re-export all controller logic with unified names for backward compatibility
export {
    upsertHallBead,
    getHallBead,
    getBeadCount,
    getHallBeads,
    getHallBeadsByStatus,
    getHallBeadsBySource,
    getHallBeadsByEpic,
    deleteHallBead,
    upsertBeadCritique,
    getBeadCritiques,
    getEpisodicMemory,
    getEpisodicMemory as getHallEpisodicMemory,
    getEpisodicMemory as listHallEpisodicMemory,
    getEpisodicMemoryById,
    saveEpisodicMemory,
    saveEpisodicMemory as saveHallEpisodicMemory,
    getValidationRuns,
    getTracesForFile,
    saveValidationRun,
    saveValidationRun as saveHallValidationRun,
    saveTrace,
    getHallPlanningSession,
    saveHallPlanningSession,
    listHallPlanningSessions,
    listHallPlanningSessions as getHallPlanningSessions,
    saveHallSkillProposal,
    listHallSkillProposals,
    listHallSkillProposals as getSkillProposals,
    getHallSkillProposal,
    getRecentAgentPings,
    registerSpoke,
    saveHallSkillObservation,
    savePing,
    getSessionPings,
    getRecentSessions,
    getPingsForSession,
    getHallRepositoryRecord,
    getHallRepositoryRecord as getHallRepository,
    upsertHallRepository,
    upsertHallRepository as saveHallRepository,
    recordHallScan,
    recordHallScan as saveHallScan,
    getHallFileByPath,
    getHallFileByPath as getHallFile,
    recordHallFile,
    recordHallFile as saveHallFile,
    getHallFiles,
    getLatestHallScanId,
    saveHallGitCommit,
    saveHallGitCommit as saveHallGitHistory,
    saveHallGitDiff,
    getHallGitHistory,
    acquireLease as acquireHallLease,
    releaseLease as releaseHallLease,
    getHallMountedSpoke,
    listHallMountedSpokes,
    saveHallMountedSpoke,
    removeHallMountedSpoke,
    migrateLegacyHallRecords,
    getHallSummary,
    updateFtsIndex,
    updateChronicleIndex,
    searchHallFiles,
    searchHallFiles as searchIntents
};
