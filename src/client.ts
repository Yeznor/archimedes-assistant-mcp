import type {
  AssetDetail,
  AssetSummary,
  BountySearchOptions,
  BountySummary,
  FetchLike
} from "./types.js";

const DEFAULT_BASE_URL = "https://archimedes.market";
const USER_AGENT = "archimedes-assistant-mcp/1.0";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ArchimedesError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "ArchimedesError";
  }
}

export interface ArchimedesClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  contextUrl?: string;
}

function validateBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("ARCHIMEDES_API_URL must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/$/, "");
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function retryDelay(attempt: number): number {
  return Math.min(250 * 2 ** attempt, 2_000);
}

export class ArchimedesClient {
  readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly contextUrl: string | undefined;

  constructor(options: ArchimedesClientOptions = {}) {
    this.baseUrl = validateBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.contextUrl = options.contextUrl
      ? validateBaseUrl(options.contextUrl)
      : undefined;
  }

  async searchAssets(query: string, limit = 10): Promise<AssetSummary[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) {
      throw new ArchimedesError("Asset searches require at least 3 characters.");
    }

    const payload = await this.requestJson("/api/semantic-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: normalizedQuery,
        type: "assets",
        limit
      })
    });
    const root = isRecord(payload) ? payload : {};
    const results = isRecord(root.results) ? root.results : {};
    const items = Array.isArray(results.assets) ? results.assets : [];
    const assets = items.slice(0, limit).flatMap((item) => {
      if (!isRecord(item) || typeof item.id !== "string") {
        return [];
      }
      const summary: AssetSummary = {
        id: item.id,
        title: asString(item.title, "Untitled asset"),
        description: asString(item.description),
        asset_type: asString(item.asset_type, "UNKNOWN"),
        price: asNumber(item.price),
        url: `${this.baseUrl}/assets/${item.id}`
      };
      if (typeof item.similarity === "number") {
        summary.similarity = item.similarity;
      }
      if (Array.isArray(item.tags)) {
        summary.tags = item.tags.filter(
          (tag): tag is string => typeof tag === "string"
        );
      }
      if (typeof item.preview_url === "string" || item.preview_url === null) {
        summary.preview_url = item.preview_url;
      }
      return [summary];
    });

    return this.rankIfConfigured(normalizedQuery, assets);
  }

  async getAsset(assetId: string): Promise<AssetDetail> {
    if (!UUID_PATTERN.test(assetId)) {
      throw new ArchimedesError("asset_id must be a UUID.");
    }
    const response = await this.request(`/assets/${assetId}`);
    const html = await response.text();
    const scripts = html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );

    for (const match of scripts) {
      try {
        const parsed: unknown = JSON.parse(decodeEntities(match[1] ?? ""));
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (const candidate of candidates) {
          if (!isRecord(candidate) || candidate["@type"] !== "Product") {
            continue;
          }
          const offers = isRecord(candidate.offers) ? candidate.offers : {};
          const property = isRecord(candidate.additionalProperty)
            ? candidate.additionalProperty
            : {};
          const detail: AssetDetail = {
            id: assetId,
            title: asString(candidate.name, "Untitled asset"),
            description: asString(candidate.description),
            asset_type: asString(candidate.category, "UNKNOWN"),
            price: asNumber(offers.price),
            currency: asString(offers.priceCurrency, "USD"),
            url: asString(candidate.url, `${this.baseUrl}/assets/${assetId}`)
          };
          if (typeof offers.availability === "string") {
            detail.availability = offers.availability;
          }
          if (typeof candidate.image === "string") {
            detail.image = candidate.image;
          }
          if (typeof property.value === "string") {
            detail.license = property.value;
          }
          return detail;
        }
      } catch {
        // Ignore unrelated or malformed JSON-LD blocks.
      }
    }

    if (response.status === 404 || html.includes("Asset not found")) {
      throw new ArchimedesError(`Asset ${assetId} was not found.`, 404);
    }
    throw new ArchimedesError(
      "Archimedes returned the asset page without readable public metadata."
    );
  }

  async searchBounties(
    options: BountySearchOptions = {}
  ): Promise<BountySummary[]> {
    const params = new URLSearchParams({
      limit: String(options.limit ?? 10),
      offset: String(options.offset ?? 0)
    });
    if (options.query?.trim()) {
      params.set("query", options.query.trim());
    }
    if (options.category) {
      params.set("category", options.category);
    }
    if (options.minPriceCents !== undefined) {
      params.set("min_price_cents", String(options.minPriceCents));
    }
    if (options.maxPriceCents !== undefined) {
      params.set("max_price_cents", String(options.maxPriceCents));
    }

    const payload = await this.requestJson(
      `/api/public/bounties?${params.toString()}`
    );
    const root = isRecord(payload) ? payload : {};
    const items = Array.isArray(root.items) ? root.items : [];
    const bounties = items.flatMap((item) =>
      isRecord(item) && typeof item.id === "string"
        ? [item as unknown as BountySummary]
        : []
    );
    return this.rankIfConfigured(options.query ?? "", bounties);
  }

  async getBounty(bountyId: string): Promise<BountySummary> {
    if (!UUID_PATTERN.test(bountyId)) {
      throw new ArchimedesError("bounty_id must be a UUID.");
    }

    const pageSize = 50;
    let offset = 0;
    for (let page = 0; page < 10; page += 1) {
      const payload = await this.requestJson(
        `/api/public/bounties?limit=${pageSize}&offset=${offset}`
      );
      const root = isRecord(payload) ? payload : {};
      const items = Array.isArray(root.items) ? root.items : [];
      const found = items.find(
        (item) => isRecord(item) && item.id === bountyId
      );
      if (found && isRecord(found)) {
        return found as unknown as BountySummary;
      }
      const total = asNumber(root.total);
      offset += items.length;
      if (items.length === 0 || offset >= total) {
        break;
      }
    }
    throw new ArchimedesError(
      `Open bounty ${bountyId} was not found in the public API.`,
      404
    );
  }

  private async rankIfConfigured<T extends { title: string; description?: string; summary?: string }>(
    query: string,
    items: T[]
  ): Promise<T[]> {
    if (!this.contextUrl || query.trim().length === 0 || items.length < 2) {
      return items;
    }
    try {
      const response = await this.requestJsonAbsolute(
        `${this.contextUrl}/rank`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            candidates: items.map((item, index) => ({
              index,
              text: `${item.title}\n${item.description ?? item.summary ?? ""}`
            }))
          })
        }
      );
      const root = isRecord(response) ? response : {};
      const ranking = Array.isArray(root.ranking) ? root.ranking : [];
      const ordered = ranking.flatMap((entry) => {
        if (!isRecord(entry) || !Number.isInteger(entry.index)) {
          return [];
        }
        const item = items[entry.index as number];
        return item ? [item] : [];
      });
      return ordered.length === items.length ? ordered : items;
    } catch {
      return items;
    }
  }

  private async requestJson(
    path: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    return this.requestJsonAbsolute(`${this.baseUrl}${path}`, init);
  }

  private async requestJsonAbsolute(
    url: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    const response = await this.requestAbsolute(url, init);
    try {
      return (await response.json()) as unknown;
    } catch (error) {
      throw new ArchimedesError(
        "Archimedes returned an invalid JSON response.",
        response.status,
        error
      );
    }
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.requestAbsolute(`${this.baseUrl}${path}`, init);
  }

  private async requestAbsolute(
    url: string,
    init: RequestInit = {}
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers = new Headers(init.headers);
        headers.set("Accept", headers.get("Accept") ?? "application/json");
        headers.set("User-Agent", USER_AGENT);
        const response = await this.fetchImpl(url, {
          ...init,
          headers,
          signal: controller.signal
        });
        if (
          response.ok ||
          (response.status < 500 && response.status !== 429) ||
          attempt === this.maxRetries
        ) {
          if (!response.ok) {
            const message = await response.text().catch(() => "");
            throw new ArchimedesError(
              `Archimedes request failed (${response.status})${
                message ? `: ${message.slice(0, 300)}` : ""
              }`,
              response.status
            );
          }
          return response;
        }
        lastError = new ArchimedesError(
          `Archimedes request failed (${response.status}).`,
          response.status
        );
      } catch (error) {
        lastError = error;
        if (
          error instanceof ArchimedesError &&
          error.status !== undefined &&
          error.status < 500 &&
          error.status !== 429
        ) {
          throw error;
        }
        if (attempt === this.maxRetries) {
          break;
        }
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    }

    if (lastError instanceof ArchimedesError) {
      throw lastError;
    }
    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new ArchimedesError(
      `Unable to reach Archimedes: ${message}`,
      undefined,
      lastError
    );
  }
}
