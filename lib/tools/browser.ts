import { z } from 'zod';
import { chromium, BrowserContext, Page } from 'playwright-core';
import { ToolDefinition, toolRegistry } from './registry';
import { getRuntimeMode, isMockAllowed } from '../runtime/runtime-mode';

// Schema for the web scraper
const WebScrapeParams = z.object({
  url: z.string().url("Must be a valid URL"),
  selector: z.string().optional().describe("Optional CSS selector to extract specific content")
});

type WebScrapeParamsType = z.infer<typeof WebScrapeParams>;

export const webScrapeTool: ToolDefinition<WebScrapeParamsType, string> = {
  name: 'web_scrape',
  description: 'Navigates to a URL using a stealth browser to bypass bot protection and returns the raw text content.',
  parameters: WebScrapeParams,
  requiredTier: 'External_Act',
  riskLevel: 'Medium',
  execute: async (params) => {
    // In production, CLOAKBROWSER_PATH would point to the custom C++ compiled Chromium binary.
    // E.g., process.env.CLOAKBROWSER_PATH || '/usr/bin/cloakbrowser'
    // For local dev without the physical binary installed, we fallback to standard playwright executable 
    // or mock it if playwright-core lacks a default executable (since core doesn't bundle browsers).
    
    let executablePath = process.env.CLOAKBROWSER_PATH;
    
    // To prevent playwright-core from crashing locally if the Cloak executable isn't defined,
    // we use a mock execution pattern for diagnostic environments.
    const mode = await getRuntimeMode();
    if (!executablePath && process.env.NODE_ENV !== 'production' && isMockAllowed(mode)) {
       console.warn("[CloakBrowser] Warning: CLOAKBROWSER_PATH not set. Operating in mock diagnostic mode.");
       const executionMode = `${mode}_diagnostic`;
       return `[${executionMode.toUpperCase()} STEALTH SCRAPE] Content from ${params.url}: "Diagnostic browser output; configure CLOAKBROWSER_PATH for live scraping."`;
    }

    if (!executablePath) {
      throw new Error("CLOAKBROWSER_PATH environment variable is required for live browser scraping.");
    }

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
      await page.goto(params.url, { waitUntil: 'networkidle', timeout: 30000 });

      let content = '';
      if (params.selector) {
        // Extract specific element
        const locator = page.locator(params.selector).first();
        content = await locator.innerText() || '';
      } else {
        // Extract entire body text
        content = await page.evaluate(() => document.body.innerText);
      }

      return content;
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
