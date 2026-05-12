# Infrastructure variables for the prod environment.
# WARNING: Do NOT commit real production credentials.
# Inject POSTGRES_PASSWORD via CI secrets or a secrets manager (doppler, sops, etc.)
POSTGRES_DB={{DATABASE_NAME_PROD}}
POSTGRES_USER={{DATABASE_USER}}
POSTGRES_PASSWORD={{DATABASE_PASSWORD}}
