import CStarCore
import Foundation
import XCTest

final class ObservationTests: XCTestCase {
    func testResultsRemainWithoutStartsAndLateStartResolvesMissingCoverage() throws {
        let result = observation("result", 1, source: 2, .operationFinished(operationID: "op", outcome: .failed))
        let first = reduce(state: .init(), observation: result).state
        XCTAssertEqual(first.operations.first?.outcome, .failed)
        XCTAssertEqual(first.outcome, .unknown, "A command failure is not the entire objective outcome")
        XCTAssertEqual(first.diagnostics.map(\.code), [.startUnavailable])

        let start = observation("start", 2, source: 1, .operationStarted(operationID: "op"))
        let second = reduce(state: first, observation: start).state
        XCTAssertEqual(second.occurrenceCount, 2)
        XCTAssertTrue(try XCTUnwrap(second.operations.first).startAvailable)
        XCTAssertFalse(second.diagnostics.contains { $0.code == .startUnavailable })
        XCTAssertEqual(second.operations.first?.outcome, .failed)
    }

    func testLateArrivalWithRecordedSequenceReplaysToIdenticalProjection() {
        let start = observation("start", 1, source: 1, .executionStarted)
        let finish = observation("finish", 2, source: 2, .executionEnded(outcome: .succeeded))
        XCTAssertEqual(replay([start, finish]), replay([finish, start]))
        XCTAssertEqual(replay([finish, start]).lifecycle, .ended)
    }

    func testIdentifiedDuplicateDoesNotIncrementEvenWithNewDeliverySequence() {
        let first = observation("event", 1, .operationStarted(operationID: "one"))
        let repeated = observation("event", 999, .operationStarted(operationID: "one"))
        let initial = reduce(state: .init(), observation: first)
        let second = reduce(state: initial.state, observation: repeated)
        XCTAssertEqual(second.disposition, .duplicate)
        XCTAssertEqual(second.state, initial.state)
        XCTAssertEqual(second.state.occurrenceCount, 1)
    }

    func testConflictingBodyIsPreservedOutsideAcceptedOccurrence() throws {
        let initial = observation("event", 1, .operationFinished(operationID: "op", outcome: .succeeded))
        let different = observation("event", 2, .operationFinished(operationID: "op", outcome: .failed))
        let result = reduce(state: replay([initial]), observation: different)
        XCTAssertEqual(result.disposition, .conflict)
        XCTAssertEqual(result.state.observations, [initial])
        XCTAssertEqual(try XCTUnwrap(result.state.identityConflicts.first).conflictingObservation, different)
        XCTAssertEqual(result.state.outcome, .conflict)
        XCTAssertEqual(result.state.operations.first?.outcome, .conflict)
        XCTAssertTrue(result.diagnostics.contains { $0.code == .identityConflict })
        let duplicateConflict = reduce(state: result.state, observation: different)
        XCTAssertEqual(duplicateConflict.disposition, .duplicate)
        XCTAssertEqual(duplicateConflict.state, result.state)
    }

    func testEqualContentDigestDoesNotCollapseIndependentOperationIdentities() {
        let first = observation("event-1", 1, .operationStarted(operationID: "op-1"), digest: "identical")
        let second = observation("event-2", 2, .operationStarted(operationID: "op-2"), digest: "identical")
        let state = replay([first, second])
        XCTAssertEqual(state.occurrenceCount, 2)
        XCTAssertEqual(state.uniqueOperationCount, 2)
    }

    func testDeliveryOnlyIdentityReportsLimitedUpstreamDeduplication() {
        let first = observation("delivery-1", 1, .boundary(kind: "permission-request"), scope: .delivery)
        let second = observation("delivery-2", 2, .boundary(kind: "permission-request"), scope: .delivery)
        let state = replay([first, first, second])
        XCTAssertEqual(state.occurrenceCount, 2)
        XCTAssertEqual(state.diagnostics.filter { $0.code == .deliveryIdentityOnly }.count, 2)
        XCTAssertEqual(state.lifecycle, .unknown)
    }

    func testDisconnectAndHostStopDoNotCompleteObjective() {
        let started = observation("start", 1, source: 1, .executionStarted)
        let disconnected = observation("disconnect", 2, source: 2, .connectionChanged(.disconnected))
        let running = replay([started, disconnected])
        XCTAssertEqual(running.lifecycle, .started)
        XCTAssertEqual(running.connectivity, .disconnected)
        XCTAssertEqual(running.outcome, .unknown)
        let stopped = reduce(state: running, observation: observation("stop", 3, source: 3, .hostStopped)).state
        XCTAssertEqual(stopped.lifecycle, .ended)
        XCTAssertEqual(stopped.outcome, .unknown)
        XCTAssertEqual(stopped.uniqueOperationCount, 0)
    }

    func testInterruptionRequestRequiresExplicitConfirmation() {
        let start = observation("start", 1, .executionStarted)
        let request = observation("request", 2, .interruptionRequested)
        let requested = replay([start, request])
        XCTAssertEqual(requested.interruption, .requested)
        XCTAssertEqual(requested.lifecycle, .started)
        XCTAssertEqual(requested.outcome, .unknown)
        let confirmed = reduce(
            state: requested, observation: observation("confirmation", 3, .interruptionConfirmed)
        ).state
        XCTAssertEqual(confirmed.interruption, .confirmed)
        XCTAssertEqual(confirmed.lifecycle, .ended)
        XCTAssertEqual(confirmed.outcome, .unknown)
        XCTAssertEqual(confirmed.occurrenceCount, 3, "No synthetic retry or execution event is generated")
    }

    func testContradictoryTerminalReportsCannotBecomeLastWriterSuccess() {
        let failed = observation("failed", 1, .executionEnded(outcome: .failed))
        let passed = observation("passed", 2, .executionEnded(outcome: .succeeded))
        XCTAssertEqual(replay([failed, passed]).outcome, .conflict)
        XCTAssertEqual(replay([passed, failed]).outcome, .conflict)
        XCTAssertTrue(replay([passed, failed]).diagnostics.contains { $0.code == .terminalConflict })
    }

    func testKnownOutcomeAndUnknownReportPreserveUncertainty() {
        let known = observation("known", 1, .executionEnded(outcome: .succeeded))
        let unknown = observation("unknown", 2, .executionEnded(outcome: .unknown))
        XCTAssertEqual(replay([known, unknown]).outcome, .unknown)
    }

    func testSourceOrderControlsConnectivityButUnorderedSourcesRemainAmbiguous() {
        let connected = observation("connected", 2, source: 1, .connectionChanged(.connected))
        let disconnected = observation("disconnected", 1, source: 2, .connectionChanged(.disconnected))
        XCTAssertEqual(replay([connected, disconnected]).connectivity, .disconnected)
        let unordered = observation("unordered", 3, .connectionChanged(.connected))
        XCTAssertEqual(replay([connected, disconnected, unordered]).connectivity, .conflict)
    }

    func testConflictingConnectionAndHostStopBodiesMakeAffectedFieldsUncertain() {
        let connected = observation("connection", 1, source: 1, .connectionChanged(.connected), digest: "body-a")
        let disconnected = observation("connection", 2, source: 1, .connectionChanged(.disconnected), digest: "body-b")
        let conflict = replay([connected, disconnected])
        XCTAssertEqual(conflict.connectivity, .conflict)
        XCTAssertEqual(conflict.observations, [connected])
        XCTAssertEqual(conflict.identityConflicts.first?.conflictingObservation, disconnected)

        let stopped = observation("connection", 3, source: 1, .hostStopped, digest: "body-c")
        for pair in [[stopped, connected], [connected, stopped]] {
            let state = replay(pair)
            XCTAssertEqual(state.connectivity, .conflict)
            XCTAssertEqual(state.lifecycle, .unknown)
            XCTAssertEqual(state.outcome, .conflict)
        }
    }

    func testConflictingInterruptionBodiesCannotClaimConfirmationOrKnownLifecycle() {
        let started = observation("start", 1, .executionStarted)
        let confirmed = observation("interrupt", 2, source: 2, .interruptionConfirmed, digest: "body-a")
        let requested = observation("interrupt", 3, source: 2, .interruptionRequested, digest: "body-b")
        for pair in [[confirmed, requested], [requested, confirmed]] {
            let state = replay([started] + pair)
            XCTAssertEqual(state.interruption, .unknown)
            XCTAssertEqual(state.lifecycle, .unknown)
            XCTAssertEqual(state.outcome, .conflict)
            XCTAssertEqual(state.occurrenceCount, 2)
        }
    }

    func testConflictingExecutionBodyMakesLifecycleUncertain() {
        let started = observation("same", 1, source: 1, .executionStarted, digest: "body-a")
        let ended = observation("same", 2, source: 1, .executionEnded(outcome: .succeeded), digest: "body-b")
        for pair in [[started, ended], [ended, started]] {
            XCTAssertEqual(replay(pair).lifecycle, .unknown)
            XCTAssertEqual(replay(pair).outcome, .conflict)
        }
    }

    func testGapsTruncationAndUnknownKindsDoNotEraseFacts() {
        let unknown = observation("unknown", 1, .unknown(kind: "future-kind", metadata: .init(text: "opaque")))
        let gap = observation("gap", 2, .coverageGap(reason: "source cursor gap"))
        let truncated = observation("truncated", 3, .boundary(kind: "compaction"), completeness: .truncated)
        let state = replay([unknown, gap, truncated])
        XCTAssertEqual(state.occurrenceCount, 3)
        XCTAssertEqual(state.outcome, .unknown)
        XCTAssertEqual(state.diagnostics.map(\.code), [.unknownKind, .sourceGap, .captureTruncated])
    }

    func testUnknownMetadataIsByteBoundedIncludingDecoding() throws {
        let text = String(repeating: "e\u{301}", count: 2_000)
        let metadata = OpaqueMetadata(text: text)
        XCTAssertLessThanOrEqual(metadata.text.utf8.count, 1_024)
        XCTAssertTrue(metadata.truncated)
        let unbounded = try JSONSerialization.data(withJSONObject: ["text": text, "truncated": false])
        let decoded = try JSONDecoder().decode(OpaqueMetadata.self, from: unbounded)
        XCTAssertLessThanOrEqual(decoded.text.utf8.count, 1_024)
        XCTAssertTrue(decoded.truncated)
    }

    func testSameIdentityWithChangedDigestIsConflictEvenIfProjectedFactMatches() {
        let one = observation("same", 1, .executionStarted, digest: "body-a")
        let two = observation("same", 2, .executionStarted, digest: "body-b")
        XCTAssertEqual(reduce(state: replay([one]), observation: two).disposition, .conflict)
    }

    func testAccumulatedIndependentOperationsRetainCountsAndReportedOutcomes() {
        let inputs = (0..<500).map { index in
            observation("event-\(index)", UInt64(index), .operationFinished(
                operationID: "operation-\(index)", outcome: index.isMultiple(of: 3) ? .failed : .succeeded
            ))
        }
        let state = replay(inputs)
        XCTAssertEqual(state.occurrenceCount, 500)
        XCTAssertEqual(state.uniqueOperationCount, 500)
        XCTAssertEqual(state.operations.filter { $0.outcome == .failed }.count, 167)
        XCTAssertEqual(state.outcome, .unknown)
    }
}

func observation(
    _ id: String, _ sequence: UInt64, source: UInt64? = nil, _ fact: ObservationFact,
    digest: String? = nil, scope: ObservationIdentity.Scope = .sourceEvent,
    completeness: Completeness = .complete
) -> Observation {
    Observation(
        identity: .init(sourceID: "test-source", eventID: id, scope: scope), ingestSequence: sequence,
        sourceSequence: source, retainedBodyDigest: digest ?? id, completeness: completeness, fact: fact
    )
}

func replay(_ observations: [Observation]) -> ExecutionState {
    observations.reduce(ExecutionState()) { reduce(state: $0, observation: $1).state }
}
