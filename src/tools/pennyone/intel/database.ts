import { join } from 'node:path';
import fs from 'node:fs';
import { 
    upsertHallBead, 
    backfillHallBeadMetadata,
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
    backfillHallPlanningSessionMetadata,
    backfillHallSkillProposalMetadata,
    saveHallPlanningSession, 
    listHallPlanningSessions,
    saveHallSkillActivation,
    saveHallSkillProposal,
    getHallSkillProposal,
    listHallSkillActivations,
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
    claimHallOneMindRequest,
    listHallOneMindBranches,
    claimNextHallOneMindRequest,
    getHallOneMindBroker,
    getHallOneMindRequest,
    listHallOneMindRequests,
    saveHallOneMindBranch,
    saveHallOneMindBroker,
    saveHallOneMindRequest,
    summarizeHallOneMindBranches,
} from './one_mind_controller.js';
import { 
    getHallRepositoryRecord, 
    listHallRepositories,
    getHallDocumentRecord,
    getHallDocumentVersion,
    backfillHallDocumentMetadata,
    reconcileLegacyHallRepositoryAliases,
    upsertHallRepository, 
    recordHallScan,
    getHallFileByPath,
    getHallFilesByIntentSummary,
    recordHallFile,
    updateHallFileIntent,
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
    listHallDocuments,
    listHallDocumentVersions,
    restoreHallDocumentVersion,
    saveHallDocumentSnapshot,
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
    public backfillHallBeadMetadata = backfillHallBeadMetadata;
    public getHallBead = getHallBead;
    public getBeadCount = getBeadCount;
    public getHallBeads = getHallBeads;
    public getHallBeadsByStatus = getHallBeadsByStatus;
    public getHallBeadsBySource = getHallBeadsBySource;
    public getHallBeadsByEpic = getHallBeadsByEpic;
    public deleteHallBead = deleteHallBead;
    public upsertBeadCritique = upsertBeadCritique;
    public getBeadCritiques = getBeadCritiques;
    public getEpisodicMemory = getEpisodicMemoryById;
    public saveEpisodicMemory = saveEpisodicMemory;
    public getValidationRuns = getValidationRuns;
    public saveValidationRun = saveValidationRun;
    public getHallPlanningSession = getHallPlanningSession;
    public backfillHallPlanningSessionMetadata = backfillHallPlanningSessionMetadata;
    public backfillHallSkillProposalMetadata = backfillHallSkillProposalMetadata;
    public saveHallPlanningSession = saveHallPlanningSession;
    public listHallPlanningSessions = listHallPlanningSessions;
    public saveHallSkillActivation = saveHallSkillActivation;
    public getHallOneMindBroker = getHallOneMindBroker;
    public getHallOneMindRequest = getHallOneMindRequest;
    public saveHallOneMindBranch = saveHallOneMindBranch;
    public saveHallOneMindBroker = saveHallOneMindBroker;
    public saveHallOneMindRequest = saveHallOneMindRequest;
    public claimHallOneMindRequest = claimHallOneMindRequest;
    public claimNextHallOneMindRequest = claimNextHallOneMindRequest;
    public listHallOneMindBranches = listHallOneMindBranches;
    public summarizeHallOneMindBranches = summarizeHallOneMindBranches;
    public listHallOneMindRequests = listHallOneMindRequests;
    public listHallSkillActivations = listHallSkillActivations;
    public saveHallSkillProposal = saveHallSkillProposal;
    public listHallSkillProposals = listHallSkillProposals;
    public getHallSkillProposal = getHallSkillProposal;
    public getRecentAgentPings = getRecentAgentPings;
    public registerSpoke = registerSpoke;
    public saveHallSkillObservation = saveHallSkillObservation;
    public getHallRepository = getHallRepositoryRecord;
    public listHallRepositories = listHallRepositories;
    public reconcileLegacyHallRepositoryAliases = reconcileLegacyHallRepositoryAliases;
    public getHallDocument = getHallDocumentRecord;
    public backfillHallDocumentMetadata = backfillHallDocumentMetadata;
    public listHallDocuments = listHallDocuments;
    public getHallDocumentVersion = getHallDocumentVersion;
    public listHallDocumentVersions = listHallDocumentVersions;
    public saveHallDocumentSnapshot = saveHallDocumentSnapshot;
    public restoreHallDocumentVersion = restoreHallDocumentVersion;
    public saveHallRepository = upsertHallRepository;
    public saveHallScan = recordHallScan;
    public getHallFile = getHallFileByPath;
    public getHallFilesByIntentSummary = getHallFilesByIntentSummary;
    public saveHallFile = recordHallFile;
    public updateHallFileIntent = updateHallFileIntent;
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

export function listHallEpisodicMemory(rootPath: string = registry.getRoot(), beadId?: string) {
    void rootPath;
    if (!beadId) {
        return [];
    }
    return getEpisodicMemory(beadId);
}

// Re-export all controller logic with unified names for backward compatibility
export {
    upsertHallBead,
    backfillHallBeadMetadata,
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
    getEpisodicMemoryById as getHallEpisodicMemory,
    saveEpisodicMemory,
    saveEpisodicMemory as saveHallEpisodicMemory,
    getValidationRuns,
    getTracesForFile,
    saveValidationRun,
    saveValidationRun as saveHallValidationRun,
    saveTrace,
    getHallPlanningSession,
    backfillHallPlanningSessionMetadata,
    backfillHallSkillProposalMetadata,
    saveHallPlanningSession,
    listHallPlanningSessions,
    listHallPlanningSessions as getHallPlanningSessions,
    saveHallSkillActivation,
    claimHallOneMindRequest,
    claimNextHallOneMindRequest,
    getHallOneMindBroker,
    getHallOneMindRequest,
    saveHallOneMindBranch,
    saveHallOneMindBroker,
    saveHallOneMindRequest,
    listHallOneMindBranches,
    summarizeHallOneMindBranches,
    listHallOneMindRequests,
    listHallSkillActivations,
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
    listHallRepositories,
    reconcileLegacyHallRepositoryAliases,
    getHallDocumentRecord,
    getHallDocumentRecord as getHallDocument,
    getHallDocumentVersion,
    backfillHallDocumentMetadata,
    listHallDocuments,
    listHallDocumentVersions,
    saveHallDocumentSnapshot,
    restoreHallDocumentVersion,
    upsertHallRepository,
    upsertHallRepository as saveHallRepository,
    recordHallScan,
    recordHallScan as saveHallScan,
    getHallFileByPath,
    getHallFileByPath as getHallFile,
    getHallFilesByIntentSummary,
    recordHallFile,
    recordHallFile as saveHallFile,
    updateHallFileIntent,
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
