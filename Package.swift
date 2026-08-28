// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "CStarCore",
    products: [
        .library(name: "CStarCore", targets: ["CStarCore"]),
    ],
    dependencies: [],
    targets: [
        .target(name: "CStarCore"),
        .testTarget(
            name: "CStarCoreTests",
            dependencies: ["CStarCore"],
            resources: [.copy("cstar-core-v1.json")]
        ),
    ]
)
