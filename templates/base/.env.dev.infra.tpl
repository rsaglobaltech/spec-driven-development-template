# Infrastructure variables for the dev environment.
# Consumed by Docker Compose for the db service.
# Do NOT put application-level config here.
POSTGRES_DB={{DATABASE_NAME_DEV}}
POSTGRES_USER={{DATABASE_USER}}
POSTGRES_PASSWORD={{DATABASE_PASSWORD}}
