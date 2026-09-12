public enum Lifecycle: String, Codable, Sendable { case unknown, started, ended }
public enum Outcome: String, Codable, Sendable { case unknown, succeeded, failed, cancelled, conflict }
public enum Interruption: String, Codable, Sendable { case none, requested, confirmed, unknown }

public struct Diagnostic: Codable, Sendable, Equatable {
    public enum Code: String, Codable, Sendable {
        case startUnavailable, startAfterResult, identityConflict, deliveryIdentityOnly
        case captureBounded, captureTruncated, coverageUnknown, sourceGap, unknownKind
        case terminalConflict, orderingUnknown, subjectUnverified, usageUnknown, inclusiveUsage
        case normalizationVersionConflict, ingestionSequenceConflict
    }
    public let code: Code
    public let eventIDs: [ObservationIdentity]
    public let detail: String?

    public init(code: Code, eventIDs: [ObservationIdentity], detail: String? = nil) {
        self.code = code
        self.eventIDs = eventIDs
        self.detail = detail
    }
}

public struct IdentityConflict: Codable, Sendable, Equatable {
    public let acceptedIdentity: ObservationIdentity
    public let conflictingObservation: Observation
}

public struct OperationState: Codable, Sendable, Equatable {
    public let id: String
    public let startEventIDs: [ObservationIdentity]
    public let resultEventIDs: [ObservationIdentity]
    public let outcome: Outcome
    public var startAvailable: Bool { !startEventIDs.isEmpty }
}

public struct ArtifactState: Codable, Sendable, Equatable {
    public let id: String
    /// Every observed version remains inspectable, including unknown revisions.
    public let observations: [ObservationIdentity]
    public let currentRevision: String?
    public let currentRevisionCertain: Bool
    /// Passing evidence for the exact current revision only; unknown revisions never match.
    public let passingCheckEventIDs: [ObservationIdentity]
}

public struct CheckEvidence: Codable, Sendable, Equatable {
    public let eventID: ObservationIdentity
    public let check: Check
}

public struct UsageSample: Codable, Sendable, Equatable {
    public let eventID: ObservationIdentity
    public let report: UsageReport
    public let completeness: Completeness
}

/// Rebuildable state for one caller-correlated execution. The record owner bounds retention.
public struct ExecutionState: Codable, Sendable, Equatable {
    public static let currentReducerVersion: UInt32 = 2
    public internal(set) var reducerVersion: UInt32
    public internal(set) var observations: [Observation]
    /// These bodies never overwrite or count as an accepted occurrence.
    public internal(set) var identityConflicts: [IdentityConflict]
    public internal(set) var lifecycle: Lifecycle
    public internal(set) var connectivity: Connectivity
    public internal(set) var outcome: Outcome
    public internal(set) var interruption: Interruption
    public internal(set) var operations: [OperationState]
    public internal(set) var artifacts: [ArtifactState]
    public internal(set) var checks: [CheckEvidence]
    /// Inclusive reports and their children are kept separate; there is no guessed total.
    public internal(set) var usage: [UsageSample]
    public internal(set) var diagnostics: [Diagnostic]
    public var occurrenceCount: Int { observations.count }
    public var uniqueOperationCount: Int { operations.count }

    public init() {
        reducerVersion = Self.currentReducerVersion
        observations = []
        identityConflicts = []
        lifecycle = .unknown
        connectivity = .unknown
        outcome = .unknown
        interruption = .none
        operations = []
        artifacts = []
        checks = []
        usage = []
        diagnostics = []
    }
}

public struct Reduction: Codable, Sendable, Equatable {
    public enum Disposition: String, Codable, Sendable { case accepted, duplicate, conflict }
    public let state: ExecutionState
    public let disposition: Disposition
    /// Current factual diagnostics; a late start may resolve a missing-start diagnostic.
    public var diagnostics: [Diagnostic] { state.diagnostics }
}
