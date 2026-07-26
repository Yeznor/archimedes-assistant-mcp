import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint =
  process.env.ARCHIMEDES_MCP_HTTP_URL ?? "http://127.0.0.1:18081/mcp";
const client = new Client({
  name: "archimedes-http-acceptance",
  version: "1.0.0"
});

try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL(endpoint))
  );
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  const expected = [
    "get_asset",
    "get_bounty",
    "search_assets",
    "search_bounties"
  ];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected tool set: ${names.join(", ")}`);
  }
  const result = await client.callTool({
    name: "search_assets",
    arguments: { query: "Python", limit: 1 }
  });
  if (result.isError) {
    throw new Error(result.content?.[0]?.text ?? "search_assets failed");
  }
  process.stdout.write("PASS streamable HTTP transport\n");
} finally {
  await client.close();
}
