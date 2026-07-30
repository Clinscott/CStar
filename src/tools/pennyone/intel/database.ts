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
    getValidationRunById,
    getTracesForFile,
    saveValidationRun, listUnstudiedEngrams,
    saveTrace
} from './bead_controller.js';
import { 
    getHallSkillActivation,
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
    getHallAgentPresence,
    listHallAgentPresence,
    listHallCoordinationEvents,
    saveHallAgentPresence,
    saveHallCoordinationEvent,
} from './agent_coordination_controller.js';
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
    removeHallMountedSpokeByRootPath,
    listAllHallMountedSpokes,
    touchSpokeHeartbeat,
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
import {
    saveHallLesson,
    getHallLesson,
    listHallLessons,
    getLessonTree
} from './lesson_controller.js';
import { ensureHallSchema } from './schema.js';
import Database from 'better-sqlite3';
import { registry } from '../pathRegistry.js';
import {
    assertStableHallStoreIdentity,
    resolveHallRootPath,
    resolveHallStorePath,
    type HallStorePath,
} from './hall_store_path.js';

const RETIRED_HALL_DB_ALIAS_ERROR =
    'legacy_hall_writable_facade_retired_use_explicit_kernel_controller';

export class HallDatabase {
    public static readonly MAX_CACHED_ROOTS_PER_MODE = 8;
    private readonlyDbs: Map<string, Database.Database> = new Map();
    private writableDbs: Map<string, Database.Database> = new Map();
    private readonlyStores: Map<string, HallStorePath> = new Map();
    private writableStores: Map<string, HallStorePath> = new Map();

    private requireCacheCapacity(
        cache: Map<string, Database.Database>,
        root: string,
    ): void {
        if (!cache.has(root) && cache.size >= HallDatabase.MAX_CACHED_ROOTS_PER_MODE) {
            throw new Error('hall_database_root_cache_limit_exceeded');
        }
    }

    /**
     * Open an existing Hall store without creating directories, files, tables,
     * indexes, views, seed rows, or migration state.
     */
    public getReadDb(rootPath: string = registry.getRoot()): Database.Database {
        const store = resolveHallStorePath(rootPath, false);
        if (!store.existingIdentity) throw new Error('hall_store_missing');
        if (this.readonlyDbs.has(store.root)) {
            assertStableHallStoreIdentity(this.readonlyStores.get(store.root)!);
            return this.readonlyDbs.get(store.root)!;
        }
        this.requireCacheCapacity(this.readonlyDbs, store.root);

        const db = new Database(store.dbPath, { readonly: true, fileMustExist: true });
        try {
            assertStableHallStoreIdentity(store);
            db.pragma('query_only = ON');
        } catch (error) {
            db.close();
            throw error;
        }
        this.readonlyDbs.set(store.root, db);
        this.readonlyStores.set(store.root, store);
        return db;
    }

    public tryGetReadDb(rootPath: string = registry.getRoot()): Database.Database | null {
        try {
            return this.getReadDb(rootPath);
        } catch (error) {
            if (error instanceof Error && error.message === 'hall_store_missing') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Explicit persistent mutation/bootstrap boundary. Callers must already be
     * on an authorized mutation path before requesting this handle.
     */
    public getWritableDb(rootPath: string = registry.getRoot()): Database.Database {
        const root = resolveHallRootPath(rootPath);
        if (this.writableDbs.has(root)) {
            assertStableHallStoreIdentity(this.writableStores.get(root)!);
            return this.writableDbs.get(root)!;
        }
        this.requireCacheCapacity(this.writableDbs, root);
        const store = resolveHallStorePath(root, true);

        const db = new Database(store.dbPath);
        try {
            assertStableHallStoreIdentity(store);
            ensureHallSchema(db, store.root);
        } catch (error) {
            db.close();
            throw error;
        }
        this.writableDbs.set(store.root, db);
        this.writableStores.set(store.root, store);
        return db;
    }

    /** Retired ambiguous writable alias. */
    public getDb(rootPath: string = registry.getRoot()): never {
        void rootPath;
        throw new Error(RETIRED_HALL_DB_ALIAS_ERROR);
    }

    public close(): void {
        for (const db of this.readonlyDbs.values()) {
            db.close();
        }
        for (const db of this.writableDbs.values()) {
            db.close();
        }
        this.readonlyDbs.clear();
        this.writableDbs.clear();
        this.readonlyStores.clear();
        this.writableStores.clear();
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
    public getValidationRunById = getValidationRunById;
    public saveValidationRun = saveValidationRun;
    public getHallPlanningSession = getHallPlanningSession;
    public backfillHallPlanningSessionMetadata = backfillHallPlanningSessionMetadata;
    public backfillHallSkillProposalMetadata = backfillHallSkillProposalMetadata;
    public saveHallPlanningSession = saveHallPlanningSession;
    public listHallPlanningSessions = listHallPlanningSessions;
    public getHallSkillActivation = getHallSkillActivation;
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
    public saveHallAgentPresence = saveHallAgentPresence;
    public getHallAgentPresence = getHallAgentPresence;
    public listHallAgentPresence = listHallAgentPresence;
    public saveHallCoordinationEvent = saveHallCoordinationEvent;
    public listHallCoordinationEvents = listHallCoordinationEvents;
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
    public removeHallMountedSpoke = removeHallMountedSpoke;
    public removeHallMountedSpokeByRootPath = removeHallMountedSpokeByRootPath;
    public listAllHallMountedSpokes = listAllHallMountedSpokes;
    public touchSpokeHeartbeat = touchSpokeHeartbeat;
    public getHallSummary = getHallSummary;
    public updateFtsIndex = updateFtsIndex;
    public updateChronicleIndex = updateChronicleIndex;
    public searchHallFiles = searchHallFiles;
    public searchIntents = searchHallFiles;
    public saveHallLesson = saveHallLesson;
    public getHallLesson = getHallLesson;
    public listHallLessons = listHallLessons;
    public getLessonTree = getLessonTree;
    public listUnstudiedEngrams = listUnstudiedEngrams;
}

export const database = new HallDatabase();

/**
 * [Ω] STANDALONE WRITABLE DB ACCESS (Legacy/Facade)
 * Compatibility-only mutation/bootstrap alias. New code must choose
 * getReadDb or getWritableDb explicitly.
 */
export function getDb(rootPath: string = registry.getRoot()): never {
    void rootPath;
    throw new Error(RETIRED_HALL_DB_ALIAS_ERROR);
}

export function getReadDb(rootPath: string = registry.getRoot()): Database.Database {
    return database.getReadDb(rootPath);
}

export function tryGetReadDb(rootPath: string = registry.getRoot()): Database.Database | null {
    return database.tryGetReadDb(rootPath);
}

export function getWritableDb(rootPath: string = registry.getRoot()): Database.Database {
    return database.getWritableDb(rootPath);
}

/**
 * [Ω] STANDALONE DB DISPOSAL (Legacy/Facade)
 * Closes the global database instance.
 */
export function closeDb(): void {
    database.close();
}

export function listUnstudiedHallEngrams(sessionsOnly = true) {
    return database.listUnstudiedEngrams(sessionsOnly);
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
    getValidationRunById,
    getTracesForFile,
    saveValidationRun as saveHallValidationRun,
    saveTrace,
    getHallPlanningSession,
    backfillHallPlanningSessionMetadata,
    backfillHallSkillProposalMetadata,
    saveHallPlanningSession,
    listHallPlanningSessions,
    listHallPlanningSessions as getHallPlanningSessions,
    getHallSkillActivation,
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
    saveHallAgentPresence,
    getHallAgentPresence,
    listHallAgentPresence,
    saveHallCoordinationEvent,
    listHallCoordinationEvents,
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
    removeHallMountedSpokeByRootPath,
    listAllHallMountedSpokes,
    touchSpokeHeartbeat,
    migrateLegacyHallRecords,
    getHallSummary,
    updateFtsIndex,
    updateChronicleIndex,
    searchHallFiles,
    searchHallFiles as searchIntents,
    saveHallLesson,
    getHallLesson,
    listHallLessons,
    listUnstudiedEngrams,
    getLessonTree
};
