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
    depends_on:
      db:
        condition: service_healthy

  db:
    image: {{DATABASE_IMAGE}}
    restart: unless-stopped
    env_file:
      - .env.${APP_ENV:-{{DEFAULT_ENV}}}.infra
    ports:
      - "${DATABASE_PORT:-{{DATABASE_PORT_DEV}}}:{{DATABASE_CONTAINER_PORT}}"
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  db_data:
    name: {{PROJECT_SLUG}}_${APP_ENV:-{{DEFAULT_ENV}}}_db_data
