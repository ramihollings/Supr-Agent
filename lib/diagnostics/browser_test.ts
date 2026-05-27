import { toolRegistry } from '../tools/registry';
import '../tools/browser'; // ensure the tool auto-registers

async function runBrowserDiagnostic() {
  console.log('--- DIAGNOSTIC 7: CloakBrowser Stealth Tools ---');
  
  const scraper = toolRegistry.getTool('web_scrape');
  if (!scraper) {
    throw new Error("web_scrape tool not found in registry!");
  }

  console.log('[+] Tool Registry loaded web_scrape definition.');
  console.log('[+] Initializing Playwright Stealth context...');
  
  // Note: we run this against a site known to block bots
  // Since we are likely in mock mode (unless CLOAKBROWSER_PATH is set), this will just verify the registry wiring.
  const testUrl = "https://nowsecure.nl"; 
  console.log(`[+] Executing scrape payload against ${testUrl}`);

  try {
    const result = await scraper.execute({ url: testUrl });
    console.log('\n[+] Scraping Result:');
    console.log(result.substring(0, 150) + "...\n");
    console.log('--- PASS: Stealth Scraper executed successfully ---\n');
    return true;
  } catch (error: any) {
    console.error('\n--- FAIL: Scraper threw an exception ---\n', error.message);
    return false;
  }
}

if (require.main === module) {
  runBrowserDiagnostic();
}
