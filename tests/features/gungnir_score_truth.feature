Feature: Gungnir score truth

  Rule: A supported source file receives a derived and comparable score

    Scenario: A breach lowers a supported file score
      Given a clean supported source file has a Gungnir matrix
      When a critical breach is introduced
      Then the derived overall score must decrease on the zero-to-ten scale
      And an explicit zero score must remain valid

  Rule: Unsupported inputs fail closed

    Scenario: An unsupported file cannot appear healthy
      Given a file type has no Gungnir audit rules
      When its audit or score is requested
      Then Gungnir must return an unsupported-extension error
      And it must not emit an empty audit or perfect score
