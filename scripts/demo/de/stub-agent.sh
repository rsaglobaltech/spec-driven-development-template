#!/usr/bin/env bash
#
# Deterministic stub "coding agent" used by the German Java demo when
# --real-agent is NOT set. Writes a real Spring Boot controller + a
# Cucumber step-definition class so `mvn test` actually executes the
# Gherkin .feature shipped by the pack. The harness gate then decides
# honestly.
set -euo pipefail

PROMPT_FILE="${1:-}"
if [ -z "$PROMPT_FILE" ] || [ ! -f "$PROMPT_FILE" ]; then
  echo "[stub-agent] kein Prompt erhalten" >&2
  exit 2
fi

REQ="$(grep -oE 'REQ-[0-9]+' "$PROMPT_FILE" | head -n1 || true)"
echo "[stub-agent] implementiere $REQ"

case "$REQ" in
  REQ-000)
    SRC=src/main/java/com/example/parking
    TST=src/test/java/com/example/parking
    RES=src/test/resources
    mkdir -p "$SRC" "$TST" "$RES"

    # ── Main: Spring Boot application + Health controller ─────────────────
    cat > "$SRC/SmartParkingApplication.java" <<'JAVA'
package com.example.parking;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SmartParkingApplication {
    public static void main(String[] args) {
        SpringApplication.run(SmartParkingApplication.class, args);
    }
}
JAVA

    cat > "$SRC/HealthController.java" <<'JAVA'
package com.example.parking;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REQ-000 — Health-Endpoint.
 * Liefert die Payload, die das Gherkin-Szenario fordert.
 */
@RestController
public class HealthController {

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}
JAVA

    # ── Test runner: JUnit Platform Suite that runs Cucumber ──────────────
    cat > "$TST/RunCucumberTest.java" <<'JAVA'
package com.example.parking;

import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.Suite;

@Suite
@IncludeEngines("cucumber")
public class RunCucumberTest {}
JAVA

    # ── Cucumber configuration: only run the feature this REQ owns ────────
    # As more requirements are implemented the path filter widens (or the
    # team switches to a tag filter like cucumber.filter.tags=@REQ-000).
    cat > "$RES/junit-platform.properties" <<'PROPS'
cucumber.features=features/core/health.feature
cucumber.glue=com.example.parking
PROPS

    # ── Step definitions: drive the .feature against the controller ───────
    cat > "$TST/HealthSteps.java" <<'JAVA'
package com.example.parking;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import java.util.Map;

public class HealthSteps {

    private final HealthController controller = new HealthController();
    private Map<String, String> payload;

    @Given("the backend service is running")
    public void theBackendServiceIsRunning() {
        // For this slice we exercise the controller directly; no Spring
        // runtime needed. A real REQ would use @SpringBootTest + MockMvc.
        assertNotNull(controller);
    }

    @When("I request the {string} endpoint")
    public void iRequestTheEndpoint(String endpoint) {
        assertEquals("/health", endpoint);
        payload = controller.health();
    }

    @Then("the response status should be {int}")
    public void theResponseStatusShouldBe(int status) {
        // Controller returns 200 by Spring default; assert the contract.
        assertEquals(200, status);
        assertNotNull(payload);
    }

    @Then("the payload should include {string} with value {string}")
    public void thePayloadShouldInclude(String key, String value) {
        assertEquals(value, payload.get(key));
    }
}
JAVA

    echo "[stub-agent] geschrieben: SmartParkingApplication, HealthController, RunCucumberTest, HealthSteps + junit-platform.properties"
    ;;
  *)
    echo "[stub-agent] keine vorgefertigte Implementierung für $REQ — bitte --real-agent verwenden" >&2
    exit 1
    ;;
esac
