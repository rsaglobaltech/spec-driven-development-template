Feature: Scheduled reports trigger on their cadence
  Scenario: Scheduled reports trigger on their cadence
    Given a daily-scheduled report at 02:00 UTC
    When 02:00 UTC arrives
    Then ScheduleTriggered is emitted and a new ReportRun starts
