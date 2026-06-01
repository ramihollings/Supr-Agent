import { z } from "zod";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import { getRuntimeMode, isMockAllowed } from "../../lib/runtime/runtime-mode";

const WebSearchParams = z.object({
  action: z.enum(["search", "fetch"]),
  query: z.string().optional().describe("The search query to look up on the web. Required for search action."),
  url: z.string().optional().describe("The absolute URL to fetch contents from. Required for fetch action.")
});

type WebSearchParamsType = z.infer<typeof WebSearchParams>;

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
          const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: tavilyKey, query: params.query })
          });
          if (response.ok) {
            const data = await response.json();
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

      // Explicit demo fallback
      return JSON.stringify([
        {
          title: `Results for "${params.query}"`,
          url: "https://example.com/search",
          content: `[${mode.toUpperCase()} MODE] Mocked search result for query: "${params.query}". Please configure TAVILY_API_KEY for live results.`
        }
      ], null, 2);
    } else {
      if (!params.url) {
        throw new Error("URL parameter is required for fetch action.");
      }

      try {
        const response = await fetch(params.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch URL ${params.url}: ${response.statusText}`);
        }
        const text = await response.text();
        // Return truncated content for safety if extremely long
        return text.length > 10000 ? `${text.substring(0, 10000)}...\n[Content Truncated]` : text;
      } catch (error: any) {
        throw new Error(`Failed to fetch URL ${params.url}: ${error.message}`);
      }
    }
  }
};

toolRegistry.registerTool(webSearchTool);
export default webSearchTool;
