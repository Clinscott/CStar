import CStarCore
import Foundation
import XCTest

final class EvidenceTests: XCTestCase {
    func testChangedArtifactDoesNotInheritPassingCheck() throws {
        let original = Artifact(id: "artifact", revision: "revision-a")
        let changed = Artifact(id: "artifact", revision: "revision-b")
        let oldArtifact = observation("a", 1, source: 1, .artifactObserved(original))
        let passed = observation("check-a", 2, source: 2, .checkReported(.init(id: "build", subject: original, result: .succeeded)))
        let initial = replay([oldArtifact, passed])
        XCTAssertEqual(initial.artifacts.first?.passingCheckEventIDs, [passed.identity])
        let current = reduce(state: initial, observation: observation("b", 3, source: 3, .artifactObserved(changed))).state
        let artifact = try XCTUnwrap(current.artifacts.first)
        XCTAssertEqual(artifact.currentRevision, "revision-b")
        XCTAssertTrue(artifact.passingCheckEventIDs.isEmpty)
        XCTAssertEqual(current.checks.first?.check.subject.revision, "revision-a")
        XCTAssertTrue(current.diagnostics.contains { $0.code == .subjectUnverified })
    }

    func testUnknownSubjectNeverMatchesAnotherUnknownAndNotesDoNotProveChecks() {
        let unknown = Artifact(id: "artifact", revision: nil)
        let artifact = observation("artifact", 1, .artifactObserved(unknown))
        let check = observation("check", 2, .checkReported(.init(id: "test", subject: unknown, result: .succeeded)))
        let note = observation("note", 3, .unknown(kind: "review-note", metadata: .init(text: "looks correct")))
        let state = replay([artifact, check, note])
        XCTAssertTrue(state.artifacts[0].passingCheckEventIDs.isEmpty)
        XCTAssertFalse(state.artifacts[0].currentRevisionCertain)
        XCTAssertEqual(state.checks.count, 1)
    }

    func testUnorderedArtifactVersionsRemainUncertain() {
        let first = observation("a", 1, .artifactObserved(.init(id: "artifact", revision: "a")))
        let second = observation("b", 2, .artifactObserved(.init(id: "artifact", revision: "b")))
        let state = replay([first, second])
        XCTAssertFalse(state.artifacts[0].currentRevisionCertain)
        XCTAssertNil(state.artifacts[0].currentRevision)
        XCTAssertEqual(state.artifacts[0].observations.count, 2)
    }

    func testContradictoryCheckAndIdentityConflictCannotCertifyArtifact() {
        let artifact = Artifact(id: "artifact", revision: "a")
        let subject = observation("subject", 1, source: 1, .artifactObserved(artifact))
        let pass = observation("pass", 2, .checkReported(.init(id: "test", subject: artifact, result: .succeeded)))
        let fail = observation("fail", 3, .checkReported(.init(id: "test", subject: artifact, result: .failed)))
        XCTAssertTrue(replay([subject, pass, fail]).artifacts[0].passingCheckEventIDs.isEmpty)
        let conflict = observation("pass", 4, .checkReported(.init(id: "test", subject: artifact, result: .failed)))
        XCTAssertTrue(replay([subject, pass, conflict]).artifacts[0].passingCheckEventIDs.isEmpty)
    }

    func testConflictingArtifactBodyKeepsAcceptedVersionButProjectionUncertain() {
        let first = observation("same", 1, source: 1, .artifactObserved(.init(id: "artifact", revision: "a")))
        let conflicting = observation("same", 2, source: 1, .artifactObserved(.init(id: "artifact", revision: "b")))
        let state = replay([first, conflicting])
        XCTAssertEqual(state.observations, [first])
        XCTAssertFalse(state.artifacts[0].currentRevisionCertain)
    }

    func testInclusiveParentAndWorkerUsageRemainSeparateWithUnknowns() throws {
        let parent = UsageReport(
            scopeID: "parent", modelID: "model-a", basis: .inclusive,
            reporting: .cumulative, inputTokens: 100, outputTokens: 25
        )
        let child = UsageReport(
            scopeID: "worker", parentScopeID: "parent", modelID: "model-b", basis: .exclusive,
            reporting: .delta, inputTokens: 20, outputTokens: nil
        )
        let parentEvent = observation("parent", 1, .usageReported(parent))
        let state = replay([
            parentEvent,
            observation("child", 2, .usageReported(child), completeness: .bounded),
            parentEvent
        ])
        XCTAssertEqual(state.usage.count, 2)
        XCTAssertEqual(state.usage[0].report.inputTokens, 100)
        XCTAssertNil(state.usage[1].report.outputTokens)
        XCTAssertEqual(state.usage[1].report.parentScopeID, "parent")
        XCTAssertTrue(state.diagnostics.contains { $0.code == .inclusiveUsage })
        XCTAssertTrue(state.diagnostics.contains { $0.code == .usageUnknown })
        XCTAssertEqual(state.usage[1].completeness, .bounded)
    }

    func testZeroUsageRemainsDistinctFromUnavailableUsage() {
        let zero = observation("zero", 1, .usageReported(.init(
            scopeID: "zero", modelID: "model", basis: .exclusive,
            reporting: .delta, inputTokens: 0, outputTokens: 0
        )))
        let unknown = observation("unknown", 2, .usageReported(.init(scopeID: "unknown")))
        let state = replay([zero, unknown])
        XCTAssertEqual(state.usage[0].report.inputTokens, 0)
        XCTAssertNil(state.usage[1].report.inputTokens)
        XCTAssertEqual(state.diagnostics.filter { $0.code == .usageUnknown }.count, 1)
    }

    func testCodableRoundTripAndReplayProduceSameStateAndCanonicalEncoding() throws {
        let inputs = [
            observation("start", 1, source: 1, .executionStarted),
            observation("operation", 2, source: 2, .operationFinished(operationID: "op", outcome: .succeeded)),
            observation("unknown", 3, .unknown(kind: "extension", metadata: .init(text: "value"))),
            observation("end", 4, source: 4, .executionEnded(outcome: .unknown))
        ]
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let recorded = try encoder.encode(inputs)
        let decoded = try JSONDecoder().decode([Observation].self, from: recorded)
        let first = replay(inputs)
        let second = replay(decoded)
        XCTAssertEqual(first, second)
        XCTAssertEqual(try encoder.encode(first), try encoder.encode(second))
        XCTAssertEqual(try JSONDecoder().decode(ExecutionState.self, from: encoder.encode(first)), first)
        XCTAssertEqual(first.reducerVersion, ExecutionState.currentReducerVersion)
    }

    func testUnknownNormalizerMixAndSequenceCollisionAreDiagnosed() {
        let first = observation("a", 1, .executionStarted)
        let second = Observation(
            identity: .init(sourceID: "test-source", eventID: "b"), ingestSequence: 1,
            normalizationVersion: 2, retainedBodyDigest: "b", fact: .hostStopped
        )
        let state = replay([second, first])
        XCTAssertTrue(state.diagnostics.contains { $0.code == .normalizationVersionConflict })
        XCTAssertTrue(state.diagnostics.contains { $0.code == .ingestionSequenceConflict })
        XCTAssertEqual(state, replay([first, second]))
    }
}
