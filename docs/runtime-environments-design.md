# Runtime Environments, Docker, Devcontainer, and Databases

## Goal

Real generated applications should carry a runtime contract from day one. The template must not stop at specs and AI rules; it should also generate the operational shape expected by real teams:

- named environments: `dev`, `feature`, and `prod`
- Docker Compose support for local services
- devcontainer support for repeatable workspaces
- real database configuration per environment
- AI rules that prevent hardcoded infrastructure assumptions

## Configuration Contract

`project.config` remains the single entrypoint for project initialization. The runtime extension adds optional keys with conservative defaults:

```bash
ENVIRONMENTS="dev,feature,prod"
DEFAULT_ENV="dev"
DOCKER_SUPPORT="true"
DEVCONTAINER_SUPPORT="true"
DATABASE_ENGINE="postgres"
DATABASE_VERSION="16"
DATABASE_NAME="my_app"
DATABASE_USER="my_app_app"
DATABASE_PASSWORD="change-me"
DATABASE_PORT="5432"
DATABASE_PORT_DEV="5432"
DATABASE_PORT_FEATURE="5433"
DATABASE_PORT_PROD="5434"
```

The first supported database engine is PostgreSQL. Additional engines should be added behind explicit `DATABASE_ENGINE` validation rather than inferred from `STACK`.

## Generated Artifacts

Base project generation now emits:

- `.env.example`
- `.env.dev`
- `.env.feature`
- `.env.prod`
- `docker-compose.yml`
- `.dockerignore`
- `.devcontainer/devcontainer.json`
- `docs/specs/runtime-environments.md`

The environment files provide separate database names for each environment:

- `${DATABASE_NAME}_dev`
- `${DATABASE_NAME}_feature`
- `${DATABASE_NAME}_prod`

The Compose file uses `APP_ENV` to choose the runtime env file:

```bash
APP_ENV=dev docker compose --env-file .env.dev up -d db
APP_ENV=feature docker compose --env-file .env.feature up -d db
APP_ENV=prod docker compose --env-file .env.prod up -d db
```

## Design Rules

- Generated application code must read environment variables instead of hardcoding database values.
- Production credentials in generated files are placeholders only.
- Domain packs may add framework-specific adapters, but they should consume this runtime contract instead of redefining it.
- The template should keep runtime support generic; stack-specific Dockerfiles can be added by project-type or module templates later.

## Next Increment

The next slice should add stack-aware runtime profiles:

- Quarkus: `application-dev.properties`, `application-feature.properties`, `application-prod.properties`
- FastAPI: `pydantic-settings` example and async database URL conventions
- NestJS: `.env` loading, TypeORM/Prisma conventions
- Frontend: API base URL per environment
