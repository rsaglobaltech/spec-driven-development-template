Feature: Defining a flag emits FlagDefined
  Scenario: Defining a flag emits FlagDefined
    Given no flag with id 'new-checkout' exists
    When an operator defines the flag with default=false
    Then FlagDefined is emitted
