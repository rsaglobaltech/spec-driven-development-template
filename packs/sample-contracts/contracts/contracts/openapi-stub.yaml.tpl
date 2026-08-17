openapi: 3.1.0
info:
  title: {{PROJECT_NAME}} provider API
  version: 1.0.0
  description: >-
    Provider contract for the {{PROVIDER_SERVICE}} provider. Consumers verify against this document;
    a breaking change here is a breaking change for every one of them.
paths:
  /health:
    get:
      summary: Liveness probe
      responses:
        "200":
          description: The service is up
          content:
            application/json:
              schema:
                type: object
                required: [status]
                properties:
                  status:
                    type: string
                    enum: [UP, DOWN]
