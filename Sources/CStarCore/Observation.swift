/// The caller supplies identities and decides which source identity is reliable.
public struct ObservationIdentity: Codable, Sendable, Equatable, Hashable {
    public enum Scope: String, Codable, Sendable { case sourceEvent, delivery }
    public let sourceID: String
    public let eventID: String
    public let scope: Scope

    public init(sourceID: String, eventID: String, scope: Scope = .sourceEvent) {
        self.sourceID = sourceID
        self.eventID = eventID
        self.scope = scope
    }
}

public enum Completeness: String, Codable, Sendable {
    case complete, bounded, truncated, unknown
}

public enum ReportedOutcome: String, Codable, Sendable {
    case succeeded, failed, cancelled, unknown
}

public enum Connectivity: String, Codable, Sendable {
    case connected, disconnected, unknown, conflict
}

public struct Artifact: Codable, Sendable, Equatable {
    public let id: String
    /// An exact revision or digest supplied by a source; nil is unknown.
    public let revision: String?

    public init(id: String, revision: String?) {
        self.id = id
        self.revision = revision
    }
}

public struct Check: Codable, Sendable, Equatable {
    public let id: String
    public let subject: Artifact
    public let result: ReportedOutcome

    public init(id: String, subject: Artifact, result: ReportedOutcome) {
        self.id = id
        self.subject = subject
        self.result = result
    }
}

/// A factual usage report, never a computed or estimated total.
public struct UsageReport: Codable, Sendable, Equatable {
    public enum Basis: String, Codable, Sendable { case exclusive, inclusive, unknown }
    public enum Reporting: String, Codable, Sendable { case delta, cumulative, unknown }
    public let scopeID: String
    public let parentScopeID: String?
    public let modelID: String?
    public let basis: Basis
    public let reporting: Reporting
    public let inputTokens: UInt64?
    public let outputTokens: UInt64?

    public init(
        scopeID: String, parentScopeID: String? = nil, modelID: String? = nil,
        basis: Basis = .unknown, reporting: Reporting = .unknown,
        inputTokens: UInt64? = nil, outputTokens: UInt64? = nil
    ) {
        self.scopeID = scopeID
        self.parentScopeID = parentScopeID
        self.modelID = modelID
        self.basis = basis
        self.reporting = reporting
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
    }
}

/// Unknown information stays opaque. Normalization must bound and redact retained text.
public struct OpaqueMetadata: Codable, Sendable, Equatable {
    public let text: String
    public let truncated: Bool

    public init(text: String) {
        // Bound bytes, including text containing unusually long combining-character sequences.
        var prefix = String(decoding: text.utf8.prefix(1_024), as: UTF8.self)
        while prefix.utf8.count > 1_024 { prefix.removeLast() }
        self.text = prefix
        self.truncated = prefix != text
    }

    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let suppliedText = try values.decode(String.self, forKey: .text)
        let suppliedTruncated = try values.decode(Bool.self, forKey: .truncated)
        let bounded = OpaqueMetadata(text: suppliedText)
        self.text = bounded.text
        self.truncated = bounded.truncated || suppliedTruncated
    }
}

public enum ObservationFact: Codable, Sendable, Equatable {
    case executionStarted
    case executionEnded(outcome: ReportedOutcome)
    case operationStarted(operationID: String)
    case operationFinished(operationID: String, outcome: ReportedOutcome)
    case hostStopped
    case connectionChanged(Connectivity)
    case interruptionRequested
    case interruptionConfirmed
    case artifactObserved(Artifact)
    case checkReported(Check)
    case usageReported(UsageReport)
    case coverageGap(reason: String)
    /// A factual boundary without implied lifecycle or outcome semantics.
    case boundary(kind: String)
    case unknown(kind: String, metadata: OpaqueMetadata)
}

public struct Observation: Codable, Sendable, Equatable {
    public let identity: ObservationIdentity
    public let ingestSequence: UInt64
    /// Only comparable within one source. A nonnumeric cursor belongs in the outer record.
    public let sourceSequence: UInt64?
    public let normalizationVersion: UInt32
    /// Identifies exactly the retained body, computed outside this kernel.
    public let retainedBodyDigest: String
    public let completeness: Completeness
    public let fact: ObservationFact

    public init(
        identity: ObservationIdentity, ingestSequence: UInt64, sourceSequence: UInt64? = nil,
        normalizationVersion: UInt32 = 1, retainedBodyDigest: String,
        completeness: Completeness = .complete, fact: ObservationFact
    ) {
        self.identity = identity
        self.ingestSequence = ingestSequence
        self.sourceSequence = sourceSequence
        self.normalizationVersion = normalizationVersion
        self.retainedBodyDigest = retainedBodyDigest
        self.completeness = completeness
        self.fact = fact
    }

    // Another delivery of one source occurrence may have a new ingestion sequence.
    func hasSameRetainedBody(as other: Self) -> Bool {
        sourceSequence == other.sourceSequence && normalizationVersion == other.normalizationVersion
            && retainedBodyDigest == other.retainedBodyDigest && completeness == other.completeness
            && fact == other.fact
    }
}
