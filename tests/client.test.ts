import { describe, expect, it, vi } from "vitest";
import { ArchimedesClient } from "../src/client.js";

function response(body: unknown, status = 200, contentType = "application/json") {
  return new Response(
    contentType === "application/json" ? JSON.stringify(body) : String(body),
    { status, headers: { "Content-Type": contentType } }
  );
}

describe("ArchimedesClient", () => {
  it("maps public asset search results", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        results: {
          assets: [
            {
              id: "1878153b-096a-486e-ac6b-7197346bdff2",
              title: "Python Decks",
              description: "Creates presentations.",
              asset_type: "DOCUMENT",
              price: 0,
              similarity: 0.9
            }
          ]
        }
      })
    );
    const client = new ArchimedesClient({
      fetchImpl,
      maxRetries: 0
    });

    await expect(client.searchAssets("Python", 5)).resolves.toEqual([
      expect.objectContaining({
        id: "1878153b-096a-486e-ac6b-7197346bdff2",
        title: "Python Decks",
        url: "https://archimedes.market/assets/1878153b-096a-486e-ac6b-7197346bdff2"
      })
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://archimedes.market/api/semantic-search",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("reads exact asset metadata from public JSON-LD", async () => {
    const html = `
      <html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Decks","description":"Engineering decks","url":"https://archimedes.market/assets/1878153b-096a-486e-ac6b-7197346bdff2","category":"DOCUMENT","offers":{"price":0,"priceCurrency":"USD","availability":"https://schema.org/InStock"},"additionalProperty":{"name":"License","value":"standard"}}
      </script></head></html>`;
    const client = new ArchimedesClient({
      fetchImpl: vi
        .fn()
        .mockResolvedValue(response(html, 200, "text/html")),
      maxRetries: 0
    });

    await expect(
      client.getAsset("1878153b-096a-486e-ac6b-7197346bdff2")
    ).resolves.toEqual(
      expect.objectContaining({
        title: "Decks",
        asset_type: "DOCUMENT",
        price: 0,
        license: "standard"
      })
    );
  });

  it("finds a bounty by UUID in the public catalogue", async () => {
    const id = "5586f0c8-cde1-416c-ac28-d85bc6a264f0";
    const client = new ArchimedesClient({
      fetchImpl: vi.fn().mockResolvedValue(
        response({
          items: [
            {
              id,
              title: "MCP Server",
              summary: "Build a server.",
              category: "SOFTWARE",
              status: "open",
              is_funded: true,
              price_cents: 10000,
              currency: "USD",
              url: `https://archimedes.market/bounties/${id}`
            }
          ],
          total: 1
        })
      ),
      maxRetries: 0
    });

    await expect(client.getBounty(id)).resolves.toEqual(
      expect.objectContaining({ id, price_cents: 10000 })
    );
  });

  it("reports useful failures without exposing internal data", async () => {
    const client = new ArchimedesClient({
      fetchImpl: vi
        .fn()
        .mockResolvedValue(response({ error: "Unavailable" }, 503)),
      maxRetries: 0
    });

    await expect(client.searchBounties()).rejects.toThrow(
      "Archimedes request failed (503)"
    );
  });
});
