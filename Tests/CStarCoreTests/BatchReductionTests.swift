@testable import CStarCore
import Foundation
import XCTest

final class BatchReductionTests: XCTestCase {
    func testEmptyBatchPreservesDecodedLegacySeedWithoutNormalization() throws {
        let one = observation("same", 9, .executionStarted)
        let other = observation("same", 1, .executionEnded(outcome: .failed))
        let seed = try decodedLegacySeed([one, other])
        let result = reduce(state: seed, observations: [])
        XCTAssertEqual(result.state, seed)
        XCTAssertEqual(result.dispositions, [])
        XCTAssertEqual(try canonicalBytes(result.state), try canonicalBytes(seed))
        XCTAssertEqual(result.state.reducerVersion, 77)
    }

    func testDuplicateOnlyTailNormalizesLegacyDerivedFieldsOnFirstInput() throws {
        let original = observation("same", 8, .executionStarted)
        let seed = try decodedLegacySeed([original])
        let inputs = [observation("same", 100, .executionStarted), observation("same", 101, .executionStarted)]
        try assertEveryPrefix(seed: seed, inputs: inputs)
        let result = reduce(state: seed, observations: inputs)
        XCTAssertEqual(result.dispositions, [.duplicate, .duplicate])
        XCTAssertEqual(result.state.reducerVersion, ExecutionState.currentReducerVersion)
        XCTAssertEqual(result.state.outcome, .unknown)
        XCTAssertEqual(result.state.operations, [])
        XCTAssertNotEqual(result.state, seed, "A nonempty scalar call always reprojects the seed")
    }

    func testDuplicateAcceptedLegacyBodiesKeepOriginalArrayFirstDecision() throws {
        let arrayFirst = observation("same", 9, .executionEnded(outcome: .failed), digest: "array-first")
        let sortsFirst = observation("same", 1, .executionStarted, digest: "sorts-first")
        let seed = try decodedLegacySeed([arrayFirst, sortsFirst])
        let inputs = [
            observation("same", 30, .executionEnded(outcome: .failed), digest: "array-first"),
            observation("same", 31, .executionEnded(outcome: .failed), digest: "array-first"),
            observation("other", 0, .hostStopped)
        ]
        try assertEveryPrefix(seed: seed, inputs: inputs)
        XCTAssertEqual(reduce(state: seed, observations: inputs).dispositions, [.duplicate, .conflict, .accepted])
    }

    func testUnsortedSeedAndOutOfOrderInputsMatchEveryPrefix() throws {
        let seed = try decodedLegacySeed([
            observation("later", 100, source: 4, .connectionChanged(.disconnected)),
            observation("earlier", 2, source: 1, .executionStarted)
        ])
        let inputs = [
            observation("later", 1000, source: 4, .connectionChanged(.disconnected)),
            observation("result", 0, source: 3, .executionEnded(outcome: .failed)),
            observation("connect", 1, source: 2, .connectionChanged(.connected)),
            observation("earlier", 1001, source: 1, .executionStarted)
        ]
        try assertEveryPrefix(seed: seed, inputs: inputs)
    }

    func testConflictOnlyTailAndRepeatedConflictBodyMatchScalarOracle() throws {
        let original = observation("same", 1, source: 1, .connectionChanged(.connected), digest: "body")
        let inputs = [
            observation("same", 2, source: 1, .connectionChanged(.disconnected), digest: "body"),
            observation("same", 200, source: 1, .connectionChanged(.disconnected), digest: "body"),
            observation("same", 3, source: 1, .hostStopped, digest: "body"),
            observation("same", 201, source: 1, .hostStopped, digest: "body")
        ]
        try assertEveryPrefix(seed: replay([original]), inputs: inputs)
        XCTAssertEqual(reduce(state: replay([original]), observations: inputs).dispositions,
                       [.conflict, .duplicate, .conflict, .duplicate])
    }

    func testExistingConflictUsesAcceptedIdentityAndExactBodyNotItsOwnIdentity() throws {
        let original = observation("accepted", 4, .executionStarted, digest: "accepted-body")
        let foreignIdentity = observation("foreign", 1, .hostStopped, digest: "conflicting-body")
        let seed = try decodedLegacySeed([original], conflicts: [
            .init(acceptedIdentity: original.identity, conflictingObservation: foreignIdentity)
        ])
        let inputs = [
            observation("accepted", 20, .executionStarted, digest: "accepted-body"),
            observation("accepted", 21, .hostStopped, digest: "conflicting-body"),
            observation("accepted", 22, .connectionChanged(.disconnected), digest: "conflicting-body")
        ]
        try assertEveryPrefix(seed: seed, inputs: inputs)
        XCTAssertEqual(reduce(state: seed, observations: inputs).dispositions, [.duplicate, .duplicate, .conflict])
    }

    func testEveryRetainedBodyFieldMattersWhileIngestSequenceDoesNot() throws {
        let identity = ObservationIdentity(sourceID: "s", eventID: "same")
        func input(_ sequence: UInt64, source: UInt64? = nil, version: UInt32 = 1,
                   digest: String = "body", completeness: Completeness = .complete,
                   fact: ObservationFact = .executionStarted) -> Observation {
            .init(identity: identity, ingestSequence: sequence, sourceSequence: source,
                  normalizationVersion: version, retainedBodyDigest: digest, completeness: completeness, fact: fact)
        }
        let inputs = [input(1), input(999), input(2, source: 2), input(3, version: 2),
                      input(4, digest: "new"), input(5, completeness: .bounded),
                      input(6, fact: .executionEnded(outcome: .succeeded)), input(1006, fact: .executionEnded(outcome: .succeeded))]
        try assertEveryPrefix(seed: .init(), inputs: inputs)
        XCTAssertEqual(reduce(state: .init(), observations: inputs).dispositions,
                       [.accepted, .duplicate, .conflict, .conflict, .conflict, .conflict, .conflict, .duplicate])
    }

    func testAllRecordedOrderTieBreaksAndIndependentIdentitiesArePreserved() throws {
        func input(_ source: String, _ event: String, _ scope: ObservationIdentity.Scope,
                   _ fact: ObservationFact, digest: String = "same") -> Observation {
            .init(identity: .init(sourceID: source, eventID: event, scope: scope), ingestSequence: 4,
                  retainedBodyDigest: digest, fact: fact)
        }
        let inputs = [input("z", "b", .sourceEvent, .executionStarted),
                      input("a", "b", .sourceEvent, .hostStopped),
                      input("a", "a", .sourceEvent, .interruptionRequested),
                      input("a", "a", .delivery, .interruptionConfirmed),
                      input("z", "b", .sourceEvent, .hostStopped),
                      input("z", "b", .sourceEvent, .connectionChanged(.connected)),
                      input("z", "b", .sourceEvent, .hostStopped)]
        try assertEveryPrefix(seed: .init(), inputs: inputs)
        let result = reduce(state: .init(), observations: inputs)
        XCTAssertEqual(result.state.occurrenceCount, 4)
        XCTAssertEqual(result.state.identityConflicts.count, 2)
        XCTAssertEqual(result.dispositions.last, .duplicate)
    }

    func testChecksArtifactsUsageAndLateStartsSurviveSeededChunks() throws {
        let artifact = Artifact(id: "artifact", revision: "r1")
        let inputs = [
            observation("result", 2, source: 2, .operationFinished(operationID: "op", outcome: .succeeded)),
            observation("artifact", 3, source: 3, .artifactObserved(artifact)),
            observation("check", 4, source: 4, .checkReported(.init(id: "check", subject: artifact, result: .succeeded))),
            observation("usage", 5, .usageReported(.init(scopeID: "child", parentScopeID: "parent", modelID: "model",
                        basis: .inclusive, reporting: .cumulative, inputTokens: 4, outputTokens: 8))),
            observation("start", 1, source: 1, .operationStarted(operationID: "op")),
            observation("new-artifact", 6, source: 5, .artifactObserved(.init(id: "artifact", revision: "r2"))),
            observation("failed-check", 7, source: 6, .checkReported(.init(id: "check", subject: artifact, result: .failed))),
            observation("gap", 8, .coverageGap(reason: "declared"))
        ]
        for split in 0...inputs.count {
            let seed = try JSONDecoder().decode(ExecutionState.self, from: JSONEncoder().encode(replay(Array(inputs.prefix(split)))))
            try assertEveryPrefix(seed: seed, inputs: Array(inputs.dropFirst(split)))
        }
    }

    func testBoundedGeneratedMixedStreamsMatchEveryPrefixAndWireRoundTrip() throws {
        for stream in 0..<24 {
            var inputs: [Observation] = []
            for index in 0..<48 {
                let identity = ObservationIdentity(sourceID: "source-\((index + stream) % 3)",
                    eventID: "event-\(index % 9)", scope: index.isMultiple(of: 5) ? .delivery : .sourceEvent)
                let facts: [ObservationFact] = [
                    .executionStarted, .executionEnded(outcome: .unknown), .hostStopped,
                    .connectionChanged(.connected), .interruptionRequested, .interruptionConfirmed,
                    .operationStarted(operationID: "op-\(index % 4)"),
                    .operationFinished(operationID: "op-\(index % 4)", outcome: .failed),
                    .artifactObserved(.init(id: "artifact", revision: index.isMultiple(of: 2) ? "r" : nil)),
                    .checkReported(.init(id: "check", subject: .init(id: "artifact", revision: "r"), result: .succeeded)),
                    .usageReported(.init(scopeID: "scope", basis: .exclusive, reporting: .delta, inputTokens: 0)),
                    .unknown(kind: "future", metadata: .init(text: "bounded"))
                ]
                inputs.append(.init(identity: identity, ingestSequence: UInt64((index * 13 + stream) % 31),
                    sourceSequence: index.isMultiple(of: 4) ? nil : UInt64((index + stream) % 7),
                    normalizationVersion: UInt32(1 + index % 2), retainedBodyDigest: "digest-\(index % 3)",
                    completeness: index.isMultiple(of: 3) ? .bounded : .complete,
                    fact: facts[(index + stream) % facts.count]))
                if index.isMultiple(of: 7) { inputs.append(inputs.last!) }
            }
            let split = stream % 11
            try assertEveryPrefix(seed: replay(Array(inputs.prefix(split))), inputs: Array(inputs.dropFirst(split)))
        }
    }
}

private func assertEveryPrefix(seed: ExecutionState, inputs: [Observation],
                               file: StaticString = #filePath, line: UInt = #line) throws {
    var expected = seed
    var dispositions: [Reduction.Disposition] = []
    for count in 0...inputs.count {
        if count > 0 {
            let reduction = reduce(state: expected, observation: inputs[count - 1])
            expected = reduction.state
            dispositions.append(reduction.disposition)
        }
        let batch = reduce(state: seed, observations: Array(inputs.prefix(count)))
        XCTAssertEqual(batch.state, expected, "state at prefix\(count)", file: file, line: line)
        XCTAssertEqual(batch.dispositions, dispositions, "dispositions at prefix\(count)", file: file, line: line)
        XCTAssertEqual(try canonicalBytes(batch.state), try canonicalBytes(expected), "wire at prefix\(count)", file: file, line: line)
        let reopened = try JSONDecoder().decode(BatchReduction.self, from: JSONEncoder().encode(batch))
        XCTAssertEqual(reopened, batch, "batch roundtrip at prefix\(count)", file: file, line: line)
    }
}

private func canonicalBytes<T: Encodable>(_ value: T) throws -> Data {
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
    return try encoder.encode(value)
}

private func decodedLegacySeed(_ observations: [Observation], conflicts: [IdentityConflict] = []) throws -> ExecutionState {
    var seed = ExecutionState()
    seed.reducerVersion = 77
    seed.observations = observations
    seed.identityConflicts = conflicts
    seed.lifecycle = .ended; seed.connectivity = .connected; seed.outcome = .succeeded
    seed.interruption = .confirmed
    seed.operations = [.init(id: "stale-derived-operation", startEventIDs: [], resultEventIDs: [], outcome: .failed)]
    seed.diagnostics = [.init(code: .sourceGap, eventIDs: [], detail: "legacy")]
    return try JSONDecoder().decode(ExecutionState.self, from: JSONEncoder().encode(seed))
}
