import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health.js";
import { projectRoutes } from "./routes/projects.js";

/** Options passed to {@link createApp}. */
export interface AppOptions {
  /** Path to the profile directory the daemon is serving. */
  profileDir?: string;
}

/**
 * Creates and configures a Fastify application instance.
 *
 * Registers all core route plugins and decorates the instance with
 * daemon-specific properties derived from {@link AppOptions}.
 *
 * @param options - Optional configuration for the app instance.
 * @returns A configured {@link FastifyInstance} ready to listen.
 */
export function createApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate("profileDir", options.profileDir ?? "");
  void app.register(healthRoutes);
  void app.register(projectRoutes);
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    /** Absolute path to the active profile directory. */
    profileDir: string;
  }
}
