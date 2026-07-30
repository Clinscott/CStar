Feature: Legacy Node and PennyOne effects are retired
  Historical scanners, importers, watchers, relays, and telemetry paths must
  not survive as alternate execution or Hall mutation lanes.

  Scenario: A caller invokes the PennyOne CLI or invocation builder
    When any legacy PennyOne action or option is supplied
    Then the surface returns the stable retirement error
    And no runtime invocation is constructed

  Scenario: A caller invokes the scanner or estate importer
    When a path, remote, clone runner, scan runner, or host invoker is supplied
    Then the surface fails before reading the path or remote
    And no Git, host-model, StateRegistry, artifact, or Hall effect occurs

  Scenario: A caller constructs live telemetry infrastructure
    When the relay, watcher, recorder, HTTP telemetry, or EventManager is used
    Then the surface fails closed or returns HTTP 410
    And no listener, client, timer, watcher, request-body read, broadcast, or Hall write occurs

  Scenario: A caller imports or runs the JavaScript Sentinel
    When the module or compatibility function is evaluated
    Then no npx, ESLint, auto-fix, or child process starts
    And maintained project tests or cstar_warden are the supported validation paths
