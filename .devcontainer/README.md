# Devcontainer

Node 20 plus a JDK 21, because the Maven and Gradle plugins are part of this
repository and CI builds them. Without the JDK a contributor can run every test
except those two jobs, and only finds out when CI disagrees with their machine.

`postCreateCommand` runs `npm ci && npm run build` — the tests run against
compiled output in `dist/`, so a fresh clone cannot invoke the CLI until it has
been built once.
