import { join } from 'node:path';
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
    saveEpisodicMemory,
    getValidationRuns,
    saveValidationRun
} from './bead_controller.js';
import { 
    getHallPlanningSession, 
    saveHallPlanningSession, 
    listHallPlanningSessions as getHallPlanningSessions,
    saveHallSkillProposal,
    getHallSkillProposal,
    listHallSkillProposals as getSkillProposals,
    getSessionsWithSummaries as getRecentAgentPings,
    registerSpoke,
    saveHallSkillObservation
} from './session_manager.js';
import { 
    getHallRepositoryRecord as getHallRepository, 
    upsertHallRepository as saveHallRepository, 
    recordHallScan as saveHallScan,
    getHallFileByPath as getHallFile,
    recordHallFile as saveHallFile,
    getHallFiles,
    getLatestHallScanId,
    saveHallGitCommit as saveHallGitHistory,
    saveHallGitDiff,
    acquireLease as acquireHallLease,
    releaseLease as releaseHallLease,
    getHallMountedSpoke,
    listHallMountedSpokes,
    saveHallMountedSpoke,
    getHallSummary,
    updateFtsIndex,
    updateChronicleIndex,
    searchIntents as searchHallFiles
} from './repository_manager.js';
import { ensureHallSchema } from './schema.js';
import Database from 'better-sqlite3';

export class HallDatabase {
    private db: Database.Database | undefined;

    public getDb(rootPath: string): Database.Database {
        if (!this.db) {
            const dbPath = join(rootPath, '.stats', 'pennyone.db');
            this.db = new Database(dbPath);
            ensureHallSchema(this.db, rootPath);
        }
        return this.db;
    }

    public close(): void {
        if (this.db) {
            this.db.close();
            this.db = undefined;
        }
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
    public getHallPlanningSessions = getHallPlanningSessions;
    public saveHallSkillProposal = saveHallSkillProposal;
    public getSkillProposals = getSkillProposals;
    public getHallSkillProposal = getHallSkillProposal;
    public getRecentAgentPings = getRecentAgentPings;
    public registerSpoke = registerSpoke;
    public saveHallSkillObservation = saveHallSkillObservation;
    public getHallRepository = getHallRepository;
    public saveHallRepository = saveHallRepository;
    public saveHallScan = saveHallScan;
    public getHallFile = getHallFile;
    public saveHallFile = saveHallFile;
    public getHallFiles = getHallFiles;
    public getLatestHallScanId = getLatestHallScanId;
    public saveHallGitHistory = saveHallGitHistory;
    public saveHallGitDiff = saveHallGitDiff;
    public acquireHallLease = acquireHallLease;
    public releaseHallLease = releaseHallLease;
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
    saveEpisodicMemory,
    getValidationRuns,
    saveValidationRun,
    getHallPlanningSession,
    saveHallPlanningSession,
    getHallPlanningSessions,
    saveHallSkillProposal,
    getSkillProposals,
    getHallSkillProposal,
    getRecentAgentPings,
    registerSpoke,
    saveHallSkillObservation,
    getHallRepository,
    saveHallRepository,
    saveHallScan,
    getHallFile,
    saveHallFile,
    getHallFiles,
    getLatestHallScanId,
    saveHallGitHistory,
    saveHallGitDiff,
    acquireHallLease,
    releaseHallLease,
    getHallMountedSpoke,
    listHallMountedSpokes,
    saveHallMountedSpoke,
    getHallSummary,
    updateFtsIndex,
    updateChronicleIndex,
    searchHallFiles,
    searchHallFiles as searchIntents
};
