Feature: CStar terminal observation adapter

  Rule: The adapter preserves the deterministic six-effect reducer

    Scenario: Six effects remain closed and ordered
      Given the accepted S01 reducer
      When the terminal observation adapter is used
      Then the effects are TASK_CREATE, TASK_RESUME, TASK_FORK, TASK_SEND, TASK_WAIT, TASK_READ
      And no seventh effect is introduced

  Rule: A missing wait notification handler does not create polling authority

    Scenario: TASK_WAIT reserves a bounded observation schedule
      Given one native TASK_SEND ACK binds the target thread and returned turn
      When TASK_WAIT is acknowledged
      Then hard_lease_ms is 1200000
      And observation offsets are 1080000 and 1200000 milliseconds
      And observation grace is 30000 milliseconds
      And native wait calls are 0
      And interval polling calls are 0

  Rule: Terminal observation is structured and hash-bound

    Scenario: The first direct read proves a terminal packet
      Given a read is inside its predetermined observation window
      And the host returns matching thread and turn identity
      And the terminal state and result are structured outside transcript text
      When the adapter records the observation
      Then TASK_READ returns one ACK
      And transcript_included is false
      And the packet binds task, root, effect, schedule, thread, turn, selector, reasoning, identity, artifacts, tests, and protected counters

    Scenario: A known nonterminal first read allows one second read
      Given observation one is known nonterminal or unavailable without identity conflict
      When observation two is due
      Then exactly one second direct read is admitted
      And a valid structured terminal packet can ACK TASK_READ

    Scenario: An inconclusive second read freezes the attempt
      Given observation one is nonterminal
      And observation two is missing, malformed, conflicting, transcript-only, or nonterminal
      When the second observation closes
      Then the result is UNKNOWN_POST_EFFECT with TERMINAL_OBSERVATION_EXHAUSTED
      And acceptance and continuation credit are zero
      And no third read, send, retry, replay, replacement, fallback, or inferred terminal is permitted

  Rule: Identity and evidence are not lifecycle authority

    Scenario: Requested and actual model identity remain separate
      Given the requested selector is gpt-5.6-luna with max reasoning
      And host attestation is absent
      Then actual identity is unreported
      And a worker self-report or transcript cannot supply lifecycle identity
      And a terminal transport receipt remains unverified until independent validation and cstar_record_result

  Rule: Protected effects remain closed

    Scenario: The implementation is source-only
      Given the adapter package is exercised offline
      Then provider calls, ENM E01 calls, Forge calls, Git actions, install, activation, restart, deployment, secrets, configuration, destructive actions, descendants, and peer messages are 0
