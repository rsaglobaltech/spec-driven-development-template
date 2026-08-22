Feature: Opt-out blocks future notifications in that channel
  Scenario: Opt-out blocks future notifications in that channel
    Given a user opts out of marketing email
    When the system attempts to send a marketing email
    Then the notification is not queued
