func projectOperations(
    _ events: [Observation], conflicts: [IdentityConflict], diagnostics: inout [Diagnostic]
) -> [OperationState] {
    func operationID(_ event: Observation) -> String? {
        switch event.fact {
        case .operationStarted(let id), .operationFinished(let id, _): return id
        default: return nil
        }
    }
    var grouped = [String: [Observation]]()
    for event in events {
        if let id = operationID(event) { grouped[id, default: []].append(event) }
    }
    return grouped.keys.sorted().map { id in
        let related = grouped[id, default: []]
        let starts = related.filter { if case .operationStarted = $0.fact { return true }; return false }
        let results = related.filter { if case .operationFinished = $0.fact { return true }; return false }
        let outcomes = results.compactMap { event -> ReportedOutcome? in
            if case .operationFinished(_, let outcome) = event.fact { return outcome }; return nil
        }
        let hasConflict = conflicts.contains { conflict in
            related.contains { $0.identity == conflict.acceptedIdentity }
                || operationID(conflict.conflictingObservation) == id
        }
        let outcome: Outcome = hasConflict ? .conflict : combinedOutcome(outcomes)
        if starts.isEmpty && !results.isEmpty {
            diagnostics.append(.init(code: .startUnavailable, eventIDs: results.map(\.identity), detail: id))
        }
        if results.contains(where: { result in starts.contains { precedes(result, $0) } }) {
            diagnostics.append(.init(code: .startAfterResult, eventIDs: related.map(\.identity), detail: id))
        }
        if outcome == .conflict {
            diagnostics.append(.init(code: .terminalConflict, eventIDs: results.map(\.identity), detail: id))
        }
        return OperationState(
            id: id, startEventIDs: starts.map(\.identity), resultEventIDs: results.map(\.identity), outcome: outcome
        )
    }
}

func projectArtifacts(
    _ events: [Observation], checks: [CheckEvidence], conflicts: [IdentityConflict],
    diagnostics: inout [Diagnostic]
) -> [ArtifactState] {
    var grouped = [String: [Observation]]()
    for event in events {
        if case .artifactObserved(let artifact) = event.fact { grouped[artifact.id, default: []].append(event) }
    }
    let subjectChecks = Dictionary(grouping: checks) { $0.check.subject.id }
    return grouped.keys.sorted().map { id in
        let related = grouped[id, default: []]
        let current = latestCandidates(related)
        let revisions = current.map { event -> String? in
            if case .artifactObserved(let artifact) = event.fact { return artifact.revision }; return nil
        }
        let known = Set(revisions.compactMap { $0 })
        let hasConflict = conflicts.contains { conflict in
            related.contains { $0.identity == conflict.acceptedIdentity }
                || {
                    if case .artifactObserved(let artifact) = conflict.conflictingObservation.fact {
                        return artifact.id == id
                    }
                    return false
                }()
        }
        let certain = !hasConflict && !revisions.contains(nil) && known.count == 1
        let revision = certain ? known.first : nil
        let relevantChecks = subjectChecks[id, default: []]
        let passing = relevantChecks.filter { evidence in
            let sameCheck = relevantChecks.filter { $0.check.id == evidence.check.id && $0.check.subject == evidence.check.subject }
            let conflictingCheck = conflicts.contains { conflict in
                sameCheck.contains { $0.eventID == conflict.acceptedIdentity }
            }
            return certain && evidence.check.subject.id == id && evidence.check.subject.revision == revision
                && !conflictingCheck && combinedOutcome(sameCheck.map(\.check.result)) == .succeeded
        }.map(\.eventID)
        if !certain && current.count > 1 {
            diagnostics.append(.init(code: .orderingUnknown, eventIDs: current.map(\.identity), detail: id))
        }
        if passing.isEmpty {
            diagnostics.append(.init(code: .subjectUnverified, eventIDs: current.map(\.identity), detail: id))
        }
        return ArtifactState(
            id: id, observations: related.map(\.identity), currentRevision: revision,
            currentRevisionCertain: certain, passingCheckEventIDs: passing
        )
    }
}
