name: Spec Validation

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  validate-specs:
    name: Validate Specification Tree
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install create-spec-driven-app
        run: npm install -g create-spec-driven-app@latest

      - name: Validate spec tree
        run: create-spec-driven-app validate .
