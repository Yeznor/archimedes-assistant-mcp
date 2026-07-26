import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchimedesClient } from "../src/client.js";
import { createServer } from "../src/server.js";

describe("MCP server", () => {
  const closeables: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(closeables.splice(0).map((item) => item.close()));
  });

  it("starts and registers exactly the four required tools", async () => {
    const service = new ArchimedesClient({
      fetchImpl: vi.fn(),
      maxRetries: 0
    });
    const server = createServer(service);
    const client = new Client({
      name: "archimedes-assistant-mcp-test",
      version: "1.0.0"
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    closeables.push(client, server);

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "get_asset",
      "get_bounty",
      "search_assets",
      "search_bounties"
    ]);
    expect(
      tools.tools.every(
        (tool) => tool.annotations?.readOnlyHint === true
      )
    ).toBe(true);
  });
});
