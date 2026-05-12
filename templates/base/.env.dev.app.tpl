# Application variables for the dev environment.
# Consumed by the application process (not Docker Compose infrastructure).
# Safe to commit to version control; never put real secrets here.
APP_ENV=dev
PROJECT_SLUG={{PROJECT_SLUG}}

DATABASE_ENGINE={{DATABASE_ENGINE}}
DATABASE_HOST={{DATABASE_HOST}}
DATABASE_PORT={{DATABASE_PORT_DEV}}
DATABASE_NAME={{DATABASE_NAME_DEV}}
DATABASE_USER={{DATABASE_USER}}
DATABASE_PASSWORD={{DATABASE_PASSWORD}}
DATABASE_URL={{DATABASE_URL_DEV}}
