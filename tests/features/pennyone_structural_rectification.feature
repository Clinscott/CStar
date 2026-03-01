Feature: Operation PennyOne Structural Rectification

  As the Corvus Star Architect
  I want strict enforcement of Thread execution, Layout constraints, and Type Safety in NeuralGraph
  So that the Sovereign HUD operates autonomously without main-thread blocking or visual breaches.

  Scenario: Organic Physics Threading (No Blocking)
    Given NeuralGraph requires a D3 Force simulation
    When the physics simulation ticks
    Then it must execute organically within the useFrame render cycle
    And it must NOT execute synchronously via a pre-calculated block loop.

  Scenario: Sovereign HUD Layout Containment
    Given the NeuralGraph active metadata panel is displayed
    When the panel renders within the Canvas HTML wrapper
    Then the panel MUST NOT use absolute positioning (left: 50%, top: 50%)
    And it must respect the flexbox layout boundaries of its parent wrapper.

  Scenario: Strict Typescript and ESLint Enforcement
    Given the PennyOne visual components are scanned
    When JS Sentinel evaluates NeuralGraph.tsx
    Then there should be zero "any" types or Forbidden non-null assertions
    And the file should not utilize "eslint-disable" overrides.
