"use strict";

/**
 * Provider clients for `alm sync` — Jira Cloud and Azure Boards, both over
 * the global fetch (Node >= 20). Each returns the same minimal interface
 * used by the sync core: { createIssue, getIssueStatus, closeIssue }.
 *
 * Credentials come from environment variables named in alm.config.yaml
 * (token_env / user_env) — never from the config file itself.
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Environment variable ${name} is not set.\n` +
        "Fix: export the ALM API token in that variable (CI: a masked secret)."
    );
  }
  return value;
}

async function checkResponse(res, what) {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${what} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  return res;
}

// ── Jira Cloud ────────────────────────────────────────────────────────────────

function jiraClient(cfg, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const token = requireEnv(cfg.token_env);
  const user = requireEnv(cfg.user_env || "JIRA_USER");
  const auth = `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;
  const headers = { Authorization: auth, "Content-Type": "application/json" };
  const base = String(cfg.base_url).replace(/\/$/, "");

  return {
    async createIssue(reqId, title) {
      const res = await checkResponse(
        await doFetch(`${base}/rest/api/3/issue`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            fields: {
              project: { key: cfg.project_key },
              issuetype: { name: cfg.issue_type || "Task" },
              summary: `${reqId} — ${title}`,
              labels: ["spec-driven", reqId],
            },
          }),
        }),
        `Jira create issue for ${reqId}`
      );
      const json = await res.json();
      return { key: json.key, url: `${base}/browse/${json.key}` };
    },

    async getIssueStatus(issueKey) {
      const res = await checkResponse(
        await doFetch(`${base}/rest/api/3/issue/${issueKey}?fields=status`, { headers }),
        `Jira read ${issueKey}`
      );
      const json = await res.json();
      const category = json.fields?.status?.statusCategory?.key;
      return category === "done" ? "done" : "open";
    },

    async closeIssue(issueKey) {
      const res = await checkResponse(
        await doFetch(`${base}/rest/api/3/issue/${issueKey}/transitions`, { headers }),
        `Jira list transitions for ${issueKey}`
      );
      const { transitions } = await res.json();
      const done = (transitions || []).find((t) => t.to?.statusCategory?.key === "done");
      if (!done) {
        throw new Error(`Jira: no transition to a done state available for ${issueKey}.`);
      }
      await checkResponse(
        await doFetch(`${base}/rest/api/3/issue/${issueKey}/transitions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ transition: { id: done.id } }),
        }),
        `Jira transition ${issueKey}`
      );
    },
  };
}

// ── Azure Boards ──────────────────────────────────────────────────────────────

function azureClient(cfg, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const token = requireEnv(cfg.token_env);
  const auth = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
  const base = String(cfg.base_url).replace(/\/$/, "");
  const api = "api-version=7.1";

  return {
    async createIssue(reqId, title) {
      const res = await checkResponse(
        await doFetch(
          `${base}/${cfg.project_key}/_apis/wit/workitems/$${encodeURIComponent(
            cfg.issue_type || "Task"
          )}?${api}`,
          {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/json-patch+json" },
            body: JSON.stringify([
              { op: "add", path: "/fields/System.Title", value: `${reqId} — ${title}` },
              { op: "add", path: "/fields/System.Tags", value: `spec-driven; ${reqId}` },
            ]),
          }
        ),
        `Azure create work item for ${reqId}`
      );
      const json = await res.json();
      return { key: String(json.id), url: json._links?.html?.href || null };
    },

    async getIssueStatus(id) {
      const res = await checkResponse(
        await doFetch(`${base}/_apis/wit/workitems/${id}?fields=System.State&${api}`, {
          headers: { Authorization: auth },
        }),
        `Azure read work item ${id}`
      );
      const json = await res.json();
      const state = json.fields?.["System.State"];
      return ["Done", "Closed", "Completed", "Resolved"].includes(state) ? "done" : "open";
    },

    async closeIssue(id) {
      await checkResponse(
        await doFetch(`${base}/_apis/wit/workitems/${id}?${api}`, {
          method: "PATCH",
          headers: { Authorization: auth, "Content-Type": "application/json-patch+json" },
          body: JSON.stringify([
            { op: "add", path: "/fields/System.State", value: cfg.done_state || "Done" },
          ]),
        }),
        `Azure close work item ${id}`
      );
    },
  };
}

function makeClient(cfg, fetchImpl) {
  return cfg.provider === "jira" ? jiraClient(cfg, fetchImpl) : azureClient(cfg, fetchImpl);
}

module.exports = { makeClient, jiraClient, azureClient };
