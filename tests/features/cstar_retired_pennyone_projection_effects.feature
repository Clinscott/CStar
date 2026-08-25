Feature: Legacy PennyOne projection helpers fail before effects
  In-memory projections may remain useful without becoming a second authority.

  Scenario: A caller builds a matrix projection
    When it uses the pure projection builder
    Then it receives an in-memory Hall or synthetic view
    And no stats artifact gravity database Git query Hall mutation or report write occurs

  Scenario: A caller invokes a retired PennyOne effect surface
    When it requests artifact output gravity mutation direct search report writing Node Warden document restore source indexing or legacy migration
    Then the matching stable retirement error is returned
    And no filesystem stdout provider Git Hall secret or callback effect occurs
