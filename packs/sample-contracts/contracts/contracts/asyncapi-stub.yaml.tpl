asyncapi: 3.0.0
info:
  title: {{PROJECT_NAME}} provider events
  version: 1.0.0
  description: >-
    Events {{PROJECT_NAME}} publishes for the the {{PROVIDER_SERVICE}} provider domain. Adding a
    required field to a payload is a breaking change for subscribers.
channels:
  healthReported:
    address: {{PROJECT_SLUG}}.health.reported
    messages:
      healthReported:
        payload:
          type: object
          required: [status, observedAt]
          properties:
            status:
              type: string
              enum: [UP, DOWN]
            observedAt:
              type: string
              format: date-time
operations:
  publishHealthReported:
    action: send
    channel:
      $ref: "#/channels/healthReported"
