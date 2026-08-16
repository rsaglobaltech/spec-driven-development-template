name: {{PROJECT_SLUG}}-${APP_ENV:-{{DEFAULT_ENV}}}

services:
  workspace:
    image: mcr.microsoft.com/devcontainers/base:ubuntu
    command: sleep infinity
    working_dir: /workspace
    volumes:
      - .:/workspace:cached
    env_file:
      - .env.${APP_ENV:-{{DEFAULT_ENV}}}.app
{{COMPOSE_DEPENDS_ON}}
{{COMPOSE_DB_SERVICE}}
