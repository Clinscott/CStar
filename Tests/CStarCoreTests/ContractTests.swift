import CStarCore
import Foundation
import XCTest

final class ContractTests: XCTestCase {
    func testRecordedContractTwiceAndAfterEveryPrefixRoundTrip() throws {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "observational-v2", withExtension: "json"))
        let contract = try JSONDecoder().decode(Contract.self, from: Data(contentsOf: url))
        XCTAssertEqual(contract.contract, "cstar.observation.v2")
        XCTAssertEqual(Set(contract.vectors.map(\.id)).count, contract.vectors.count)
        let facts: [String: ObservationFact] = [
            "started": .executionStarted,
            "stopped": .hostStopped,
            "disconnected": .connectionChanged(.disconnected),
            "failed": .executionEnded(outcome: .failed),
            "succeeded": .executionEnded(outcome: .succeeded),
            "cancelled": .executionEnded(outcome: .cancelled),
            "operation-failed": .operationFinished(operationID: "op", outcome: .failed),
            "operation-started": .operationStarted(operationID: "op"),
            "interruption-requested": .interruptionRequested,
            "interruption-confirmed": .interruptionConfirmed,
            "unknown": .unknown(kind: "future", metadata: .init(text: "retained")),
            "gap": .coverageGap(reason: "declared gap")
        ]
        for vector in contract.vectors {
            let inputs = try vector.facts.enumerated().map { index, name in
                observation("\(vector.id)-\(index)", UInt64(index), try XCTUnwrap(facts[name]))
            }
            for _ in 1...2 {
                var state = ExecutionState()
                for input in inputs {
                    state = reduce(state: state, observation: input).state
                    state = try JSONDecoder().decode(ExecutionState.self, from: JSONEncoder().encode(state))
                }
                XCTAssertEqual(state, replay(inputs), vector.id)
                XCTAssertEqual(state.lifecycle.rawValue, vector.lifecycle, vector.id)
                XCTAssertEqual(state.outcome.rawValue, vector.outcome, vector.id)
                XCTAssertEqual(state.uniqueOperationCount, vector.operations, vector.id)
                XCTAssertEqual(state.occurrenceCount, inputs.count, vector.id)
                if let expected = vector.diagnostic {
                    XCTAssertTrue(state.diagnostics.contains { $0.code.rawValue == expected }, vector.id)
                } else {
                    XCTAssertTrue(state.diagnostics.isEmpty, vector.id)
                }
            }
        }
    }
}

private struct Contract: Decodable {
    let contract: String
    let vectors: [Vector]
    struct Vector: Decodable {
        let id: String
        let facts: [String]
        let lifecycle: String
        let outcome: String
        let operations: Int
        let diagnostic: String?
    }
}
