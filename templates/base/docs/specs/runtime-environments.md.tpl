# Runtime Environments

## Environment Catalog

| Environment | Purpose | Env file | Database |
| --- | --- | --- | --- |
| dev | Local development and day-to-day implementation | `.env.dev` | `{{DATABASE_NAME_DEV}}` |
| feature | Short-lived branch or preview validation | `.env.feature` | `{{DATABASE_NAME_FEATURE}}` |
| prod | Production-like configuration contract | `.env.prod` | `{{DATABASE_NAME_PROD}}` |

Default environment: `{{DEFAULT_ENV}}`

## Docker

- Docker support: `{{DOCKER_SUPPORT}}`
- Compose file: `docker-compose.yml`
- Database engine: `{{DATABASE_ENGINE}}`
- Database image: `{{DATABASE_IMAGE}}`
- Internal database host: `{{DATABASE_HOST}}`
- Internal database port: `{{DATABASE_CONTAINER_PORT}}`

Run a specific environment:

```bash
APP_ENV=dev docker compose --env-file .env.dev up -d db
APP_ENV=feature docker compose --env-file .env.feature up -d db
APP_ENV=prod docker compose --env-file .env.prod up -d db
```

## Database URLs

| Environment | URL |
| --- | --- |
| dev | `{{DATABASE_URL_DEV}}` |
| feature | `{{DATABASE_URL_FEATURE}}` |
| prod | `{{DATABASE_URL_PROD}}` |

## Devcontainer

- Devcontainer support: `{{DEVCONTAINER_SUPPORT}}`
- Configuration: `.devcontainer/devcontainer.json`
- The devcontainer joins the same Compose network as the database service.

## Rules

- Do not share database names between environments.
- Do not commit real production credentials.
- Keep app configuration environment-driven; code must not hardcode credentials, hosts, ports, or database names.
