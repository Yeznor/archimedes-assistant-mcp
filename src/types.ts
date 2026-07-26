export interface AssetSummary {
  id: string;
  title: string;
  description: string;
  asset_type: string;
  price: number;
  similarity?: number;
  tags?: string[];
  preview_url?: string | null;
  url: string;
}

export interface AssetDetail {
  id: string;
  title: string;
  description: string;
  asset_type: string;
  price: number;
  currency: string;
  availability?: string;
  image?: string;
  license?: string;
  url: string;
}

export interface BountySummary {
  id: string;
  display_id?: string;
  title: string;
  summary: string;
  category: string;
  complexity?: string;
  status: string;
  escrow_status?: string;
  is_funded: boolean;
  price_cents: number;
  currency: string;
  deadline_iso?: string | null;
  created_at_iso?: string;
  requirements_summary?: string[];
  deliverables_summary?: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
  url: string;
}

export interface BountySearchOptions {
  query?: string;
  category?: "software" | "hardware" | "research" | "mcp";
  minPriceCents?: number;
  maxPriceCents?: number;
  limit?: number;
  offset?: number;
}

export interface FetchLike {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}
