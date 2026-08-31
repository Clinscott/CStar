import CStarCore
import Foundation
import XCTest

final class CStarCoreTests: XCTestCase {
    func testCompleteContractTwice() throws {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "cstar-core-v1", withExtension: "json")
        )
        let contract = try JSONDecoder().decode(
            Contract.self,
            from: Data(contentsOf: url)
        )
        let states: [String: State] = [
            "constructed": .constructed,
            "submitted": .submitted,
            "observed": .observed,
            "disposed": .disposed,
        ]
        let events: [String: Event] = [
            "construct": .construct,
            "submit": .submit,
            "observe": .observe,
            "dispose": .dispose,
        ]

        XCTAssertEqual(contract.contract, "cstar.core.v1")
        XCTAssertEqual(
            contract.states,
            ["constructed", "submitted", "observed", "disposed"]
        )
        XCTAssertEqual(
            contract.events,
            ["construct", "submit", "observe", "dispose"]
        )
        XCTAssertEqual(contract.rejection, "invalid_transition")
        XCTAssertTrue(contract.rules.noStateIsUnconstructed)
        XCTAssertTrue(contract.rules.allUnlistedPairsReject)
        XCTAssertTrue(contract.rules.rejectionPreservesCallerState)
        XCTAssertTrue(contract.rules.runEachVectorTwice)

        let priors: [String?] = [nil] + contract.states.map { Optional($0) }
        let expectedPairs = Set(
            priors.flatMap { prior in
                contract.events.map { event in
                    Pair(prior: prior, event: event)
                }
            }
        )
        let actualPairs = contract.vectors.map {
            Pair(prior: $0.prior, event: $0.event)
        }

        XCTAssertEqual(contract.vectors.count, 20)
        XCTAssertEqual(Set(actualPairs), expectedPairs)
        XCTAssertEqual(Set(actualPairs).count, actualPairs.count)
        XCTAssertEqual(
            Set(contract.vectors.map(\.id)).count,
            contract.vectors.count
        )
        XCTAssertEqual(
            contract.vectors.filter { $0.result.accepted != nil }.count,
            5
        )
        XCTAssertEqual(
            contract.vectors.filter { $0.result.rejected != nil }.count,
            15
        )

        var evaluations = 0
        for pass in 1...2 {
            for vector in contract.vectors {
                let prior = try vector.prior.map {
                    try XCTUnwrap(states[$0], "\(vector.id): unknown prior state")
                }
                let event = try XCTUnwrap(
                    events[vector.event],
                    "\(vector.id): unknown event"
                )
                let expected: CStarCore.Result

                if let accepted = vector.result.accepted {
                    XCTAssertNil(vector.result.rejected, vector.id)
                    expected = .accepted(
                        try XCTUnwrap(
                            states[accepted],
                            "\(vector.id): unknown accepted state"
                        )
                    )
                } else {
                    XCTAssertEqual(
                        vector.result.rejected,
                        contract.rejection,
                        vector.id
                    )
                    expected = .rejectedInvalidTransition
                }

                XCTAssertEqual(
                    reduce(state: prior, event: event),
                    expected,
                    "\(vector.id), pass \(pass)"
                )
                evaluations += 1
            }
        }

        XCTAssertEqual(evaluations, expectedPairs.count * 2)
    }
}

private struct Contract: Decodable {
    let contract: String
    let states: [String]
    let events: [String]
    let rejection: String
    let rules: Rules
    let vectors: [Vector]
}

private struct Rules: Decodable {
    let noStateIsUnconstructed: Bool
    let allUnlistedPairsReject: Bool
    let rejectionPreservesCallerState: Bool
    let runEachVectorTwice: Bool

    enum CodingKeys: String, CodingKey {
        case noStateIsUnconstructed = "no_state_is_unconstructed"
        case allUnlistedPairsReject = "all_unlisted_pairs_reject"
        case rejectionPreservesCallerState = "rejection_preserves_caller_state"
        case runEachVectorTwice = "run_each_vector_twice"
    }
}

private struct Vector: Decodable {
    let id: String
    let prior: String?
    let event: String
    let result: Expected
}

private struct Expected: Decodable {
    let accepted: String?
    let rejected: String?
}

private struct Pair: Hashable {
    let prior: String?
    let event: String
}
