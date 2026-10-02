/// Pure reduction. It preserves facts before deriving meaning; it never requests another action.
public func reduce(state: ExecutionState, observation: Observation) -> Reduction {
    var occurrences = state.observations
    var conflicts = state.identityConflicts
    let disposition: Reduction.Disposition
    if let accepted = occurrences.first(where: { $0.identity == observation.identity }) {
        if accepted.hasSameRetainedBody(as: observation) {
            disposition = .duplicate
        } else if conflicts.contains(where: {
            $0.acceptedIdentity == observation.identity
                && $0.conflictingObservation.hasSameRetainedBody(as: observation)
        }) {
            disposition = .duplicate
        } else {
            conflicts.append(.init(acceptedIdentity: accepted.identity, conflictingObservation: observation))
            disposition = .conflict
        }
    } else {
        occurrences.append(observation)
        disposition = .accepted
    }
    let projected = project(occurrences: occurrences.sorted(by: recordedOrder), conflicts: conflicts)
    return Reduction(state: projected, disposition: disposition)
}

private func recordedOrder(_ lhs: Observation, _ rhs: Observation) -> Bool {
    if lhs.ingestSequence != rhs.ingestSequence { return lhs.ingestSequence < rhs.ingestSequence }
    if lhs.identity.sourceID != rhs.identity.sourceID { return lhs.identity.sourceID < rhs.identity.sourceID }
    if lhs.identity.scope != rhs.identity.scope { return lhs.identity.scope.rawValue < rhs.identity.scope.rawValue }
    return lhs.identity.eventID < rhs.identity.eventID
}

/// This relation intentionally says nothing about unordered or independent sources.
func precedes(_ lhs: Observation, _ rhs: Observation) -> Bool {
    guard lhs.identity.sourceID == rhs.identity.sourceID,
          let left = lhs.sourceSequence, let right = rhs.sourceSequence else { return false }
    return left < right
}

func latestCandidates(_ events: [Observation]) -> [Observation] {
    var maxima = [String: UInt64]()
    for event in events {
        if let sequence = event.sourceSequence {
            maxima[event.identity.sourceID] = max(maxima[event.identity.sourceID] ?? 0, sequence)
        }
    }
    return events.filter { event in
        event.sourceSequence == nil || event.sourceSequence == maxima[event.identity.sourceID]
    }
}

func combinedOutcome(_ reports: [ReportedOutcome]) -> Outcome {
    let known = Set(reports.filter { $0 != .unknown }.map(\.rawValue))
    if known.count > 1 { return .conflict }
    // An explicit unknown does not become a known success through another report.
    if reports.contains(.unknown) { return .unknown }
    switch known.first {
    case "succeeded": return .succeeded
    case "failed": return .failed
    case "cancelled": return .cancelled
    default: return .unknown
    }
}

private func project(occurrences: [Observation], conflicts: [IdentityConflict]) -> ExecutionState {
    var state = ExecutionState()
    state.observations = occurrences
    state.identityConflicts = conflicts.sorted { recordedOrder($0.conflictingObservation, $1.conflictingObservation) }
    var started = [Observation]()
    var ended = [Observation]()
    var connectionEvents = [Observation]()
    var terminalReports = [ReportedOutcome]()
    var hasHostStop = false

    for event in occurrences {
        appendCoverage(event, to: &state.diagnostics)
        switch event.fact {
        case .executionStarted:
            started.append(event)
        case .executionEnded(let outcome):
            ended.append(event)
            terminalReports.append(outcome)
        case .hostStopped:
            hasHostStop = true
            connectionEvents.append(event)
        case .connectionChanged:
            connectionEvents.append(event)
        case .interruptionRequested:
            if state.interruption != .confirmed { state.interruption = .requested }
        case .interruptionConfirmed:
            state.interruption = .confirmed
        case .checkReported(let check):
            state.checks.append(.init(eventID: event.identity, check: check))
        case .usageReported(let report):
            state.usage.append(.init(eventID: event.identity, report: report, completeness: event.completeness))
            if report.basis == .inclusive {
                state.diagnostics.append(.init(code: .inclusiveUsage, eventIDs: [event.identity]))
            }
            if report.inputTokens == nil || report.outputTokens == nil || report.modelID == nil
                || report.basis == .unknown || report.reporting == .unknown {
                state.diagnostics.append(.init(code: .usageUnknown, eventIDs: [event.identity]))
            }
        default:
            break
        }
    }

    if !ended.isEmpty || hasHostStop || state.interruption == .confirmed {
        state.lifecycle = .ended
    } else if !started.isEmpty {
        state.lifecycle = .started
    }
    state.outcome = conflicts.isEmpty ? combinedOutcome(terminalReports) : .conflict
    if !ended.isEmpty && started.isEmpty {
        state.diagnostics.append(.init(code: .startUnavailable, eventIDs: ended.map(\.identity)))
    }
    if ended.contains(where: { end in started.contains { precedes(end, $0) } }) {
        state.diagnostics.append(.init(code: .startAfterResult, eventIDs: (started + ended).map(\.identity)))
    }
    if state.outcome == .conflict && conflicts.isEmpty {
        state.diagnostics.append(.init(code: .terminalConflict, eventIDs: ended.map(\.identity)))
    }
    let connectionCandidates = latestCandidates(connectionEvents)
    let connectionValues = Set(connectionCandidates.map { event -> String in
        if case .connectionChanged(let value) = event.fact { return value.rawValue }
        return Connectivity.disconnected.rawValue
    })
    if connectionValues.count > 1 {
        state.connectivity = .conflict
        state.diagnostics.append(.init(code: .orderingUnknown, eventIDs: connectionCandidates.map(\.identity)))
    } else if let value = connectionValues.first {
        state.connectivity = Connectivity(rawValue: value) ?? .unknown
    }
    // A conflicting body cannot leave an affected field looking certain merely because
    // the first body was retained as the accepted occurrence.
    let acceptedByIdentity = Dictionary(occurrences.map { ($0.identity, $0) }, uniquingKeysWith: { first, _ in first })
    for conflict in conflicts {
        let affected = [acceptedByIdentity[conflict.acceptedIdentity]?.fact, conflict.conflictingObservation.fact]
        for fact in affected.compactMap({ $0 }) {
            switch fact {
            case .connectionChanged:
                state.connectivity = .conflict
            case .hostStopped:
                state.connectivity = .conflict
                state.lifecycle = .unknown
            case .interruptionRequested:
                state.interruption = .unknown
            case .interruptionConfirmed:
                state.interruption = .unknown
                state.lifecycle = .unknown
            case .executionStarted, .executionEnded:
                state.lifecycle = .unknown
            default: break
            }
        }
    }
    for conflict in state.identityConflicts {
        state.diagnostics.append(.init(code: .identityConflict, eventIDs: [conflict.acceptedIdentity]))
    }
    let versions = Set(occurrences.map(\.normalizationVersion))
    if versions.count > 1 {
        state.diagnostics.append(.init(code: .normalizationVersionConflict, eventIDs: occurrences.map(\.identity)))
    }
    let collidingSequences = Dictionary(grouping: occurrences, by: \.ingestSequence).filter { $0.value.count > 1 }
    for sequence in collidingSequences.keys.sorted() {
        let sameSequence = collidingSequences[sequence, default: []]
        state.diagnostics.append(.init(code: .ingestionSequenceConflict, eventIDs: sameSequence.map(\.identity)))
    }
    state.operations = projectOperations(occurrences, conflicts: conflicts, diagnostics: &state.diagnostics)
    state.artifacts = projectArtifacts(
        occurrences, checks: state.checks, conflicts: conflicts, diagnostics: &state.diagnostics
    )
    return state
}

private func appendCoverage(_ event: Observation, to diagnostics: inout [Diagnostic]) {
    if event.identity.scope == .delivery {
        diagnostics.append(.init(code: .deliveryIdentityOnly, eventIDs: [event.identity]))
    }
    switch event.completeness {
    case .bounded: diagnostics.append(.init(code: .captureBounded, eventIDs: [event.identity]))
    case .truncated: diagnostics.append(.init(code: .captureTruncated, eventIDs: [event.identity]))
    case .unknown: diagnostics.append(.init(code: .coverageUnknown, eventIDs: [event.identity]))
    case .complete: break
    }
    switch event.fact {
    case .coverageGap(let reason):
        diagnostics.append(.init(code: .sourceGap, eventIDs: [event.identity], detail: reason))
    case .unknown(let kind, let metadata):
        diagnostics.append(.init(code: .unknownKind, eventIDs: [event.identity], detail: kind))
        if metadata.truncated {
            diagnostics.append(.init(code: .captureTruncated, eventIDs: [event.identity]))
        }
    default: break
    }
}

/// Pure batch reduction with the same final state and input dispositions as
/// sequential calls to `reduce(state:observation:)`. The caller still owns
/// correlation, ordering, persistence and all host actions.
public func reduce(state: ExecutionState, observations: [Observation]) -> BatchReduction {
    guard let first = observations.first else {
        // A caller may have decoded a legacy seed with noncanonical fields.
        // No supplied input means no normalization or projection of that seed.
        return BatchReduction(state: state, dispositions: [])
    }

    var identities = Set<ObservationIdentity>()
    if state.observations.contains(where: { !identities.insert($0.identity).inserted }) {
        // Legacy seeds can contain several accepted bodies for one identity.
        // Preserve the scalar reducer's array-first decision and subsequent
        // sorting exactly rather than choosing a new accepted body in an index.
        var current = state
        var dispositions: [Reduction.Disposition] = []
        for observation in observations {
            let reduction = reduce(state: current, observation: observation)
            current = reduction.state
            dispositions.append(reduction.disposition)
        }
        return BatchReduction(state: current, dispositions: dispositions)
    }

    // A nonempty scalar call always projects, even for a duplicate input.
    // Apply it before indexing so decoded seed order and derived fields have
    // exactly the same first-input normalization as the sequential oracle.
    let initial = reduce(state: state, observation: first)
    if observations.count == 1 {
        return BatchReduction(state: initial.state, dispositions: [initial.disposition])
    }
    var occurrences = initial.state.observations
    var conflicts = initial.state.identityConflicts
    var accepted = Dictionary(uniqueKeysWithValues: occurrences.map { ($0.identity, $0) })
    var conflictingBodies: [RetainedConflictKey: [Observation]] = [:]
    for conflict in conflicts {
        let key = RetainedConflictKey(identity: conflict.acceptedIdentity, observation: conflict.conflictingObservation)
        conflictingBodies[key, default: []].append(conflict.conflictingObservation)
    }
    var dispositions = [initial.disposition]
    var changed = false

    for observation in observations.dropFirst() {
        let disposition: Reduction.Disposition
        if let original = accepted[observation.identity] {
            let key = RetainedConflictKey(identity: observation.identity, observation: observation)
            if original.hasSameRetainedBody(as: observation)
                || conflictingBodies[key, default: []].contains(where: { $0.hasSameRetainedBody(as: observation) }) {
                disposition = .duplicate
            } else {
                conflicts.append(.init(acceptedIdentity: original.identity, conflictingObservation: observation))
                conflictingBodies[key, default: []].append(observation)
                disposition = .conflict
                changed = true
            }
        } else {
            occurrences.append(observation)
            accepted[observation.identity] = observation
            disposition = .accepted
            changed = true
        }
        dispositions.append(disposition)
    }

    // Duplicate-only remaining inputs cannot change the already normalized seed.
    let result = changed
        ? project(occurrences: occurrences.sorted(by: recordedOrder), conflicts: conflicts)
        : initial.state
    return BatchReduction(state: result, dispositions: dispositions)
}

/// Bucket only fields used by retained-body equality that are already hashable.
/// The typed fact must still compare equal inside a bucket: a digest is not proof.
private struct RetainedConflictKey: Hashable {
    let identity: ObservationIdentity
    let sourceSequence: UInt64?
    let normalizationVersion: UInt32
    let retainedBodyDigest: String
    let completeness: String

    init(identity: ObservationIdentity, observation: Observation) {
        self.identity = identity
        sourceSequence = observation.sourceSequence
        normalizationVersion = observation.normalizationVersion
        retainedBodyDigest = observation.retainedBodyDigest
        completeness = observation.completeness.rawValue
    }
}
