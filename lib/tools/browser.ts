import { z } from 'zod';
import { chromium, BrowserContext, Page } from 'playwright-core';
import { ToolDefinition, toolRegistry } from './registry';

// Schema for the web scraper. The `format` field is additive: existing
// callers that omit it still get the legacy string response, while the
// Research workspace uses `format: 'html'` (or `'both'`) to render the
// captured page inside a sandboxed <iframe srcdoc> preview.
const WebScrapeParams = z.object({
  url: z.string().url("Must be a valid URL"),
  selector: z.string().optional().describe("Optional CSS selector to extract specific content"),
  format: z.enum(['text', 'html', 'both']).optional().describe(
    "Response shape. 'text' (default) returns the legacy string body text. 'html' returns structured {title, html, text}. 'both' returns the full structured payload."
  ),
});

type WebScrapeParamsType = z.infer<typeof WebScrapeParams>;

export type CloakBrowserScrapeResult = {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  html: string;
  statusCode: number | null;
  retrievedAt: string;
};

export const webScrapeTool: ToolDefinition<WebScrapeParamsType, string | CloakBrowserScrapeResult> = {
  name: 'web_scrape',
  description: 'Navigates to a URL using a stealth browser to bypass bot protection and returns the raw text content.',
  parameters: WebScrapeParams,
  requiredTier: 'External_Act',
  riskLevel: 'Medium',
  execute: async (params) => {
    // In production, CLOAKBROWSER_PATH would point to the custom C++ compiled Chromium binary.
    // E.g., process.env.CLOAKBROWSER_PATH || '/usr/bin/cloakbrowser'
    // For local dev without the physical binary installed, configure CLOAKBROWSER_PATH
    // or use a route-specific browser integration that supplies a live executable.

    let executablePath = process.env.CLOAKBROWSER_PATH;

    if (!executablePath) {
      throw new Error("CLOAKBROWSER_PATH environment variable is required for live browser scraping.");
    }

    const format = params.format ?? 'text';

    let browser;
    try {
      browser = await chromium.launch({
        executablePath: executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled' // Additional standard flag, though CloakBrowser handles this natively
        ]
      });

      const context: BrowserContext = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });

      const page: Page = await context.newPage();

      // Wait until network is mostly idle to ensure JS renders
      const response = await page.goto(params.url, { waitUntil: 'networkidle', timeout: 30000 });

      let text = '';
      let html = '';
      if (params.selector) {
        // Extract specific element
        const locator = page.locator(params.selector).first();
        text = await locator.innerText() || '';
        html = (await locator.evaluate((el) => (el as HTMLElement).outerHTML)) || '';
      } else {
        // Extract entire body text + full document HTML in a single
        // round-trip so the Research workspace can render the page
        // inside a sandboxed <iframe srcdoc> preview.
        const payload = await page.evaluate(() => ({
          title: document.title || '',
          text: document.body ? document.body.innerText : '',
          html: document.documentElement ? document.documentElement.outerHTML : '',
        }));
        text = payload.text;
        html = payload.html;
      }

      if (format === 'text') {
        return text;
      }

      const result: CloakBrowserScrapeResult = {
        url: params.url,
        finalUrl: page.url(),
        title: await page.title(),
        text,
        html,
        statusCode: response ? response.status() : null,
        retrievedAt: new Date().toISOString(),
      };
      return result;
    } catch (error: any) {
      throw new Error(`CloakBrowser execution failed: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
};

// Auto-register the tool
toolRegistry.registerTool(webScrapeTool);
