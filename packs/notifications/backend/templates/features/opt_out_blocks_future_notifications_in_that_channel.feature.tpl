Feature: Opt-out blocks future notifications in that channel
  Scenario: Opt-out blocks future notifications in that channel
    GIVEN a user opts out of marketing email
    WHEN the system attempts to send a marketing email
    THEN the notification is not queued
