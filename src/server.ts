import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ArchimedesClient } from "./client.js";

function toolResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}

function wrap<T>(handler: (args: T) => Promise<unknown>) {
  return async (args: T) => {
    try {
      return toolResult(await handler(args));
    } catch (error) {
      return toolError(error);
    }
  };
}

export function createServer(client: ArchimedesClient): McpServer {
  const server = new McpServer(
    {
      name: "archimedes-assistant-mcp",
      version: "1.0.0"
    },
    {
      instructions:
        "Search the public Archimedes Market catalogue. All tools are read-only and require no Archimedes credentials."
    }
  );

  server.registerTool(
    "search_assets",
    {
      title: "Search assets",
      description:
        "Search public Archimedes engineering assets by meaning or keyword.",
      inputSchema: z.object({
        query: z.string().trim().min(3).max(500),
        limit: z.number().int().min(1).max(20).default(10)
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    wrap((args: { query: string; limit: number }) =>
      client.searchAssets(args.query, args.limit)
    )
  );

  server.registerTool(
    "get_asset",
    {
      title: "Get asset",
      description:
        "Get public details for one Archimedes asset using its UUID.",
      inputSchema: z.object({
        asset_id: z.uuid()
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    wrap((args: { asset_id: string }) => client.getAsset(args.asset_id))
  );

  server.registerTool(
    "search_bounties",
    {
      title: "Search bounties",
      description:
        "Search funded, open Archimedes bounties with optional category and payout filters.",
      inputSchema: z
        .object({
          query: z.string().trim().min(1).max(500).optional(),
          category: z
            .enum(["software", "hardware", "research", "mcp"])
            .optional(),
          min_price_cents: z.number().int().nonnegative().optional(),
          max_price_cents: z.number().int().nonnegative().optional(),
          limit: z.number().int().min(1).max(50).default(10),
          offset: z.number().int().nonnegative().default(0)
        })
        .refine(
          (value) =>
            value.min_price_cents === undefined ||
            value.max_price_cents === undefined ||
            value.min_price_cents <= value.max_price_cents,
          {
            message:
              "min_price_cents must be less than or equal to max_price_cents"
          }
        ),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    wrap(
      (args: {
        query?: string | undefined;
        category?:
          | "software"
          | "hardware"
          | "research"
          | "mcp"
          | undefined;
        min_price_cents?: number | undefined;
        max_price_cents?: number | undefined;
        limit: number;
        offset: number;
      }) =>
        client.searchBounties({
          ...(args.query ? { query: args.query } : {}),
          ...(args.category ? { category: args.category } : {}),
          ...(args.min_price_cents === undefined
            ? {}
            : { minPriceCents: args.min_price_cents }),
          ...(args.max_price_cents === undefined
            ? {}
            : { maxPriceCents: args.max_price_cents }),
          limit: args.limit,
          offset: args.offset
        })
    )
  );

  server.registerTool(
    "get_bounty",
    {
      title: "Get bounty",
      description:
        "Get one open Archimedes bounty, including its requirements and deliverables.",
      inputSchema: z.object({
        bounty_id: z.uuid()
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    wrap((args: { bounty_id: string }) =>
      client.getBounty(args.bounty_id)
    )
  );

  return server;
}
