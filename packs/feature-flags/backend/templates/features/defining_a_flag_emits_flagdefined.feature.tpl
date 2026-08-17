Feature: Defining a flag emits FlagDefined
  Scenario: Defining a flag emits FlagDefined
    GIVEN no flag with id 'new-checkout' exists
    WHEN an operator defines the flag with default=false
    THEN FlagDefined is emitted
