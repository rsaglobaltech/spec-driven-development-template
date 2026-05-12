"use strict";
const { setWorldConstructor } = require("@cucumber/cucumber");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../..");
const CLI = path.join(ROOT, "bin", "create-spec-driven-app.js");

const BASE_CONFIG = `PROJECT_NAME="BDD Test Project"
PROJECT_SLUG="bdd-test-project"
PROJECT_TYPE="backend"
DOMAIN="testing"
STACK="Node.js 20"
API_STYLE="REST"
TESTING="Jest"
DOCKER_SUPPORT="false"
DEVCONTAINER_SUPPORT="false"
`;

class CliWorld {
  constructor() {
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-bdd-"));
    this.configPath = path.join(this.tmpDir, "project.config");
    this.outDir = path.join(this.tmpDir, "out");
    this.projectDir = path.join(this.outDir, "bdd-test-project");
    this.result = null;
    fs.writeFileSync(this.configPath, BASE_CONFIG);
    fs.mkdirSync(this.outDir, { recursive: true });
  }

  run(args) {
    this.result = spawnSync("node", [CLI, ...args], {
      encoding: "utf8",
      cwd: ROOT,
      timeout: 30000,
    });
    return this.result;
  }

  runInit(extra = []) {
    return this.run([
      "init",
      "--config", this.configPath,
      "--out", this.outDir,
      "--force",
      "--no-git",
      ...extra,
    ]);
  }

  writeConfig(content) {
    fs.writeFileSync(this.configPath, content);
  }

  cleanup() {
    fs.rmSync(this.tmpDir, { recursive: true, force: true });
  }
}

setWorldConstructor(CliWorld);
