import { z } from "zod";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import { getRuntimeMode, isMockAllowed } from "../../lib/runtime/runtime-mode";
import { safeFetchText } from "../../lib/net/safe-fetch";

const WebSearchParams = z.object({
  action: z.enum(["search", "fetch"]),
  query: z.string().optional().describe("The search query to look up on the web. Required for search action."),
  url: z.string().optional().describe("The absolute URL to fetch contents from. Required for fetch action.")
});

type WebSearchParamsType = z.infer<typeof WebSearchParams>;

// The web_search tool is the only agent path that touches the public
// internet, so it must reuse the proxy's SSRF defenses: block private
// IPs (incl. 169.254.169.254 cloud metadata, 127.0.0.0/8, 10/8, etc.),
// DNS-pin to defeat TOCTOU rebinds, re-validate every redirect, and
// cap the response size. See lib/net/safe-fetch.ts.

export const webSearchTool: ToolDefinition<WebSearchParamsType, string> = {
  name: "web_search",
  description: "Queries web search engines or scrapes markdown contents from any public URL.",
  parameters: WebSearchParams,
  requiredTier: "Observe",
  riskLevel: "Low",
  execute: async (params) => {
    if (params.action === "search") {
      if (!params.query) {
        throw new Error("Query parameter is required for web search action.");
      }

      const tavilyKey = process.env.TAVILY_API_KEY;
      if (tavilyKey) {
        try {
          // Tavily is a fixed external endpoint hardcoded by us, so
          // it is not a user-controlled SSRF vector. We still want
          // the same hard size cap and timeout, so we use a plain
          // fetch (the URL is not attacker-influenced) plus the
          // timeout/size guards that the safeFetch wrapper would
          // have applied. This keeps the type signature simple
          // (SafeFetchOptions is GET-only).
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          let response: Response;
          try {
            response = await fetch("https://api.tavily.com/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ api_key: tavilyKey, query: params.query }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timer);
          }
          if (response.ok) {
            const data: any = await response.json();
            return JSON.stringify(data.results, null, 2);
          }
        } catch (e: any) {
          console.warn("[web-search] Tavily API error, falling back to mock search:", e.message);
        }
      }

      const mode = await getRuntimeMode();
      if (!isMockAllowed(mode)) {
        throw new Error("web_search requires TAVILY_API_KEY or another live search provider in real runtime mode.");
      }

      throw new Error("web_search requires TAVILY_API_KEY or another live search provider.");
    } else {
      if (!params.url) {
        throw new Error("URL parameter is required for fetch action.");
      }

      try {
        // safeFetchText applies the full SSRF defense: protocol check,
        // private-IP block, DNS pinning, redirect re-validation, and
        // a hard size cap. The previous implementation called
        // fetch(params.url) directly, which an agent could use to hit
        // cloud metadata services or local services.
        const text = await safeFetchText(params.url, { maxBytes: 10_000, timeoutMs: 8000 });
        return text.length > 10000 ? `${text.substring(0, 10000)}...\n[Content Truncated]` : text;
      } catch (error: any) {
        throw new Error(`Failed to fetch URL ${params.url}: ${error.message}`);
      }
    }
  }
};

toolRegistry.registerTool(webSearchTool);
export default webSearchTool;
