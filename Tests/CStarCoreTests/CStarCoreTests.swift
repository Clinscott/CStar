import CStarCore
import Foundation
import XCTest

final class CStarCoreTests: XCTestCase {
    func testContractVectorsTwice() throws {
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

        XCTAssertEqual(contract.vectors.count, 8)
        XCTAssertEqual(contract.vectors.filter { $0.result.accepted != nil }.count, 5)
        XCTAssertEqual(contract.vectors.filter { $0.result.rejected != nil }.count, 3)

        for _ in 0..<2 {
            for vector in contract.vectors {
                let prior = try vector.prior.map { try XCTUnwrap(states[$0]) }
                let event = try XCTUnwrap(events[vector.event])
                let expected: CStarCore.Result

                if let accepted = vector.result.accepted {
                    XCTAssertNil(vector.result.rejected)
                    expected = .accepted(try XCTUnwrap(states[accepted]))
                } else {
                    XCTAssertEqual(vector.result.rejected, "invalid_transition")
                    expected = .rejectedInvalidTransition
                }

                XCTAssertEqual(reduce(state: prior, event: event), expected)
            }
        }
    }
}

private struct Contract: Decodable {
    let vectors: [Vector]
}

private struct Vector: Decodable {
    let prior: String?
    let event: String
    let result: Expected
}

private struct Expected: Decodable {
    let accepted: String?
    let rejected: String?
}
