Feature: Generated repository residue isolation

  Rule: Generated runtime residue cannot return to versioned surfaces

    Scenario: A clean checkout contains no generated harness recordings
      Given SDK traces and the CacheBro snapshot are runtime residue
      When generated harness and cache paths are inspected
      Then the orphan Raven proxy and recorded traces must be absent
      And anchored ignore rules must prevent trace and cache regeneration from being tracked
      And a missing CacheBro cache must load as empty without creating a file
