#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ArchimedesClient } from "./client.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const timeout = Number.parseInt(
    process.env.ARCHIMEDES_TIMEOUT_MS ?? "10000",
    10
  );
  if (!Number.isFinite(timeout) || timeout < 100 || timeout > 120_000) {
    throw new Error(
      "ARCHIMEDES_TIMEOUT_MS must be an integer from 100 to 120000."
    );
  }
  const client = new ArchimedesClient({
    ...(process.env.ARCHIMEDES_API_URL
      ? { baseUrl: process.env.ARCHIMEDES_API_URL }
      : {}),
    ...(process.env.ARCHIMEDES_CONTEXT_URL
      ? { contextUrl: process.env.ARCHIMEDES_CONTEXT_URL }
      : {}),
    timeoutMs: timeout
  });
  const server = createServer(client);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`archimedes-assistant-mcp failed to start: ${message}\n`);
  process.exitCode = 1;
});
