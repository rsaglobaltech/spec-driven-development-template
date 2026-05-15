# 🎬 Kollegen-Demo (Deutsch · Java + Spring)

1080p-Demo des spec-driven Tagesablaufs auf einem **Java + Spring**-Stack,
mit deutscher Bildschirm-Beschriftung und (optional) deutscher Voice-over.
Der Harness ruft **echtes opencode** auf — der Agent schreibt echten
Java-Code, `mvn test` läuft wirklich, und am Ende landet das Ergebnis auf
einem reviewbaren Git-Branch.

> Diese Variante existiert parallel zur englischen Node-Demo in
> [`../`](..). Die Logik ist gleich, nur Sprache, Stack und Agent
> unterscheiden sich.

## Was zeigt das Video

Jedes Feature, eingebettet in den Tagesablauf:

1. `csda init` — Projekt aus YAML-Konfig anlegen
2. `csda specops add` — Domain-Pack einbinden (echtes
   `parking-management-specops`)
3. `csda plan` — was noch zu tun ist
4. `csda validate --strict-tdd` — Gate auf grün
5. Maven-`pom.xml` und `harness.config.yaml` ablegen
6. `git init && git commit` — sauberer Working Tree
7. **`csda harness run --req REQ-000`** — opencode bekommt den Prompt,
   schreibt `HealthService.java` + `HealthServiceTest.java`, der Harness
   bestätigt mit validate + `mvn -o test` und commitet auf
   `harness/REQ-000`
8. `cat` der Agent-Dateien
9. `mvn -B -o test` — Tests laufen real grün
10. `csda specops diff` — Pack-Sync prüfen
11. `csda pack lint --graph` — Domain-Modell visualisieren

## Verwendete CLI-Version

Das Build-Skript ruft **`npx create-spec-driven-app@0.1.3`** auf — also
genau das, was Kollegen ohne Setup auch sehen würden. Überschreibbar mit
`CSDA_CLI_PKG`:

```bash
CSDA_CLI_PKG=create-spec-driven-app@latest bash scripts/demo/de/build-video.sh --real-agent
```

## Zwei Agent-Modi

| Modus              | Flag           | Was er macht                                                                                                                 |
| ------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Stub** (Default) | _(keiner)_     | `stub-agent.sh` schreibt deterministisch echten Java-Code für REQ-000. Offline, reproduzierbar, gut für CI und Trockenläufe. |
| **opencode**       | `--real-agent` | `opencode run "$(cat {prompt_file})"`. Authentisch, nicht-deterministisch, ~30–60 s. Für die Kollegen-Demo empfohlen.        |

Der Harness-Loop ist in beiden Fällen identisch — nur das Agent-Kommando
ändert sich.

## Voraussetzungen

- **Erforderlich:** [`vhs`](https://github.com/charmbracelet/vhs),
  `node` ≥ 20, `git`, `mvn`
- **Für `--real-agent`:** [`opencode`](https://opencode.ai) auf `PATH`,
  konfiguriert
- **Für Voice-over (optional):** `ffmpeg`, `jq`, `curl`, `OPENAI_API_KEY`

```bash
# macOS
brew install vhs ffmpeg jq maven
```

## Verwendung

```bash
# Kollegen-Demo mit echtem opencode  ->  out/demo.mp4 + demo.gif
bash scripts/demo/de/build-video.sh --real-agent

# Mit deutscher Voice-over  ->  out/demo-narrated.mp4
OPENAI_API_KEY=sk-... bash scripts/demo/de/build-video.sh --real-agent

# Schnelle Vorschau mit dem Stub (kein opencode nötig)
bash scripts/demo/de/build-video.sh
```

## Wie das Video deterministisch _und_ echt bleibt

- Das Build-Skript wärmt den Pack-Cache vor (einmaliger `git clone`).
- Es wärmt den Maven-Cache vor (`mvn dependency:go-offline`), damit
  `mvn -o test` während der Aufnahme offline läuft.
- Im Stub-Modus ist alles 100 % reproduzierbar.
- Im `--real-agent`-Modus hängt das Bild vom Agenten ab — der Code ist
  trotzdem echt, das Gate ehrlich.

## Bearbeiten

- **Pacing oder Kommandos ändern:** `demo.tape`. VHS führt jede `Type`-Zeile
  als echten Shell-Befehl aus.
- **Narration anpassen:** `narration.json`. Pro Tape-Abschnitt ein
  Segment, in derselben Reihenfolge.
- **Sleep nach `harness run`:** der Platzhalter `%%HARNESS_SLEEP%%` wird
  vom Build-Skript ersetzt — 6 s im Stub-Modus, 90 s mit `--real-agent`.
  Wenn opencode bei dir länger braucht, in `build-video.sh` anpassen.
- **Anderes REQ mit dem Stub:** das `case` in `stub-agent.sh` erweitern —
  ein neues `REQ-NNN)` mit dem Code und Test, der die Szenario-Bedingungen
  erfüllt.
