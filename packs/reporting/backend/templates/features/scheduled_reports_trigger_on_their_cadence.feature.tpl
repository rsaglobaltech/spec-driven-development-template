Feature: Scheduled reports trigger on their cadence
  Scenario: Scheduled reports trigger on their cadence
    GIVEN a daily-scheduled report at 02:00 UTC
    WHEN 02:00 UTC arrives
    THEN ScheduleTriggered is emitted and a new ReportRun starts
