{
  "name": "{{PROJECT_NAME}}",
  "dockerComposeFile": "../docker-compose.yml",
  "service": "workspace",
  "workspaceFolder": "/workspace",
  "shutdownAction": "stopCompose",
  "remoteEnv": {
    "APP_ENV": "{{DEFAULT_ENV}}"
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-azuretools.vscode-docker",
        "redhat.vscode-yaml"
      ]
    }
  }
}
