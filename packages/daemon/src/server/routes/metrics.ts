/**
 * Prometheus metrics endpoint for the ATC daemon.
 *
 * Exposes operational gauges in the Prometheus text exposition format (v0.0.4):
 * - `atc_merge_queue_depth` — landing queue depth per project.
 * - `atc_craft_count` — craft count broken out by {@link CraftStatus}.
 * - `atc_agent_count` — agent count broken out by {@link AgentStatus}.
 *
 * Consumers can derive an agent crash rate via
 * `rate(atc_agent_count{status="terminated"}[5m])`.
 */

import type { FastifyInstance } from "fastify";
import { CraftStatus } from "@airtrafficcontrol/types";
import type { AgentStatus } from "../../types.js";

const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

const CRAFT_STATUSES = Object.values(CraftStatus) as string[];
const AGENT_STATUSES: AgentStatus[] = ["running", "paused", "suspended", "terminated"];

/** Escapes a label value for the Prometheus text format. */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Renders a single Prometheus metric family (HELP + TYPE header, then one
 * sample line per label combination) and appends it to the output array.
 */
function renderFamily(
  out: string[],
  name: string,
  help: string,
  type: "gauge",
  samples: Array<{ labels: Record<string, string>; value: number }>,
): void {
  out.push(`# HELP ${name} ${help}`);
  out.push(`# TYPE ${name} ${type}`);
  for (const { labels, value } of samples) {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
      .join(",");
    out.push(`${name}{${labelStr}} ${value}`);
  }
}

/**
 * Registers the `/metrics` route as a Fastify plugin.
 *
 * Route:
 * - `GET /metrics` — Prometheus text exposition format.
 *
 * @param app - The Fastify instance to register routes on.
 */
export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Prometheus metrics scrape endpoint.
   *
   * Returns gauge metrics for merge queue depth, craft counts by status, and
   * agent counts by status in the standard Prometheus text format.
   */
  app.get("/metrics", async (_request, reply) => {
    const out: string[] = [];

    // ------------------------------------------------------------------
    // atc_merge_queue_depth
    // ------------------------------------------------------------------
    const queueSamples = app.towerStore.listAll().map(({ projectName, queue }) => ({
      labels: { project: projectName },
      value: queue.length,
    }));

    renderFamily(
      out,
      "atc_merge_queue_depth",
      "Number of crafts waiting in the tower landing queue per project.",
      "gauge",
      queueSamples,
    );

    // ------------------------------------------------------------------
    // atc_craft_count
    // ------------------------------------------------------------------
    const allCrafts = app.craftStore.listAll();
    const craftCountByStatus = new Map<string, number>(CRAFT_STATUSES.map((s) => [s, 0]));
    for (const craft of allCrafts) {
      const current = craftCountByStatus.get(craft.status) ?? 0;
      craftCountByStatus.set(craft.status, current + 1);
    }

    renderFamily(
      out,
      "atc_craft_count",
      "Number of crafts grouped by lifecycle status.",
      "gauge",
      Array.from(craftCountByStatus.entries()).map(([status, count]) => ({
        labels: { status },
        value: count,
      })),
    );

    // ------------------------------------------------------------------
    // atc_agent_count
    // ------------------------------------------------------------------
    const allAgents = app.agentStore.list();
    const agentCountByStatus = new Map<string, number>(AGENT_STATUSES.map((s) => [s, 0]));
    for (const agent of allAgents) {
      const current = agentCountByStatus.get(agent.status) ?? 0;
      agentCountByStatus.set(agent.status, current + 1);
    }

    renderFamily(
      out,
      "atc_agent_count",
      'Number of agents grouped by status. Use atc_agent_count{status="terminated"} to track crash rate.',
      "gauge",
      Array.from(agentCountByStatus.entries()).map(([status, count]) => ({
        labels: { status },
        value: count,
      })),
    );

    // Prometheus requires a trailing newline after the last metric family.
    const body = out.join("\n") + "\n";

    void reply.header("Content-Type", PROMETHEUS_CONTENT_TYPE).send(body);
  });
}
