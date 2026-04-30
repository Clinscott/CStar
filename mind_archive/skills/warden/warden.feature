Feature: Atomic GPT Neural Warden
  Scenario: Anomaly Detection in execution metadata
    Given the AnomalyWarden is initialized with a 5-dimension weights matrix
    When a metadata vector [latency, tokens, loops, errors, lore_alignment] is processed
    Then the warden MUST return a probability score between 0.0 and 1.0
    And high probability anomalies MUST be logged to the anomalies queue.

  Scenario: Lore-Aware Alignment Verification
    Given a file's intent is defined in the Hall of Records
    When an action is performed on that file
    Then the warden MUST calculate the keyword intersection between action and intent
    And return an alignment score reflecting the degree of lore compliance.
