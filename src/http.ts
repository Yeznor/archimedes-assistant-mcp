#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";
import { ArchimedesClient } from "./client.js";
import { createServer } from "./server.js";

function makeClient(): ArchimedesClient {
  const timeout = Number.parseInt(
    process.env.ARCHIMEDES_TIMEOUT_MS ?? "10000",
    10
  );
  if (!Number.isFinite(timeout) || timeout < 100 || timeout > 120_000) {
    throw new Error(
      "ARCHIMEDES_TIMEOUT_MS must be an integer from 100 to 120000."
    );
  }
  return new ArchimedesClient({
    ...(process.env.ARCHIMEDES_API_URL
      ? { baseUrl: process.env.ARCHIMEDES_API_URL }
      : {}),
    ...(process.env.ARCHIMEDES_CONTEXT_URL
      ? { contextUrl: process.env.ARCHIMEDES_CONTEXT_URL }
      : {}),
    timeoutMs: timeout
  });
}

const host = process.env.MCP_HOST ?? "127.0.0.1";
const configuredAllowedHosts =
  process.env.MCP_ALLOWED_HOSTS?.split(",").map((value) => value.trim()) ?? [];
const allowedHosts = Array.from(
  new Set([
    ...configuredAllowedHosts,
    process.env.RENDER_EXTERNAL_HOSTNAME?.trim() ?? ""
  ])
).filter(Boolean);
if (
  host !== "127.0.0.1" &&
  host !== "localhost" &&
  host !== "::1" &&
  !allowedHosts.length
) {
  throw new Error(
    "MCP_ALLOWED_HOSTS is required when MCP_HOST is not a loopback address."
  );
}
const app = createMcpExpressApp({
  host,
  ...(allowedHosts.length ? { allowedHosts } : {})
});

app.get("/health", (_request: Request, response: Response) => {
  response.json({
    ok: true,
    service: "archimedes-assistant-mcp",
    transport: "streamable-http"
  });
});

type ActiveSession = {
  server: ReturnType<typeof createServer>;
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, ActiveSession>();

function requestSessionId(request: Request): string | undefined {
  const header = request.headers["mcp-session-id"];
  return Array.isArray(header) ? header[0] : header;
}

function reportRequestError(error: unknown, response: Response): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`MCP HTTP request failed: ${message}\n`);
  if (!response.headersSent) {
    response.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal server error"
      },
      id: null
    });
  }
}

app.post("/mcp", async (request: Request, response: Response) => {
  try {
    const sessionId = requestSessionId(request);
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) {
      await existing.transport.handleRequest(request, response, request.body);
      return;
    }
    if (!sessionId && isInitializeRequest(request.body)) {
      const server = createServer(makeClient());
      let transport: StreamableHTTPServerTransport;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, { server, transport });
        }
      });
      transport.onclose = () => {
        const closedSessionId = transport.sessionId;
        if (closedSessionId) {
          sessions.delete(closedSessionId);
        }
      };
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(request, response, request.body);
      return;
    }
    response.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Missing or invalid MCP session."
      },
      id: null
    });
  } catch (error) {
    reportRequestError(error, response);
  }
});

async function handleSessionRequest(request: Request, response: Response) {
  const sessionId = requestSessionId(request);
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    response.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Missing or invalid MCP session."
      },
      id: null
    });
    return;
  }
  try {
    await session.transport.handleRequest(request, response);
  } catch (error) {
    reportRequestError(error, response);
  }
}

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isFinite(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer from 1 to 65535.");
}

const listener = app.listen(port, host, () => {
  process.stderr.write(
    `Archimedes MCP HTTP endpoint listening on ${host}:${port}.\n`
  );
});
listener.on("error", (error: Error) => {
  process.stderr.write(`HTTP server failed: ${error.message}\n`);
  process.exitCode = 1;
});
