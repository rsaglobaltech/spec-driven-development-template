#!/usr/bin/env bash
#
# Deterministic stub "coding agent" used by the German Java demo when
# --real-agent is NOT set. Writes real Java + JUnit code that genuinely
# makes `mvn -q -B -o test` pass — so the gate decides honestly.
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
    mkdir -p src/main/java/com/example/parking src/test/java/com/example/parking
    cat > src/main/java/com/example/parking/HealthService.java <<'JAVA'
package com.example.parking;

/**
 * REQ-000 — Health-Endpoint.
 * Liefert die Smoke-Test-Payload, die das Gherkin-Szenario erwartet.
 */
public final class HealthService {

    public Status check() {
        return new Status("UP");
    }

    public record Status(String status) {}
}
JAVA
    cat > src/test/java/com/example/parking/HealthServiceTest.java <<'JAVA'
package com.example.parking;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class HealthServiceTest {

    @Test
    void meldetServiceAlsUp() {
        var status = new HealthService().check();
        assertEquals("UP", status.status());
    }
}
JAVA
    echo "[stub-agent] HealthService.java + HealthServiceTest.java geschrieben"
    ;;
  *)
    echo "[stub-agent] keine vorgefertigte Implementierung für $REQ — bitte --real-agent verwenden" >&2
    exit 1
    ;;
esac
