import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const KNOWN_ASSET = "1878153b-096a-486e-ac6b-7197346bdff2";
const KNOWN_BOUNTY = "5586f0c8-cde1-416c-ac28-d85bc6a264f0";
const installedExecutable = process.env.ARCHIMEDES_MCP_EXECUTABLE;

const transport = new StdioClientTransport({
  command: installedExecutable ?? process.execPath,
  args: installedExecutable ? [] : ["dist/index.js"]
});
const client = new Client({
  name: "archimedes-live-acceptance",
  version: "1.0.0"
});

function assertSuccessful(name, response) {
  if (response.isError) {
    throw new Error(`${name} failed: ${response.content?.[0]?.text ?? "error"}`);
  }
  const text = response.content?.find((part) => part.type === "text")?.text;
  if (!text) {
    throw new Error(`${name} returned no text result.`);
  }
  const parsed = JSON.parse(text);
  if (
    parsed === null ||
    (Array.isArray(parsed) && parsed.length === 0)
  ) {
    throw new Error(`${name} returned no results.`);
  }
  process.stdout.write(`PASS ${name}\n`);
}

try {
  await client.connect(transport);
  const tests = [
    [
      "search_assets",
      { query: "Python", limit: 3 }
    ],
    [
      "get_asset",
      { asset_id: KNOWN_ASSET }
    ],
    [
      "search_bounties",
      { query: "MCP", limit: 3 }
    ],
    [
      "get_bounty",
      { bounty_id: KNOWN_BOUNTY }
    ]
  ];
  for (const [name, args] of tests) {
    const result = await client.callTool({ name, arguments: args });
    assertSuccessful(name, result);
  }
} finally {
  await client.close();
}
