import { TopNav } from '@/components/TopNav';

export default function MissionPacketPage() {
  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Mission Packet" />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto w-full space-y-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b-4 border-primary pb-6 space-y-6 md:space-y-0">
          <div>
            <h2 className="font-headline text-5xl font-black tracking-tighter text-primary uppercase mb-2">BuildSignal Mission Packet</h2>
            <p className="font-body text-xl font-bold text-on-surface-variant uppercase">Q3 Roadmap Planning</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <button className="bg-surface-container text-primary font-headline font-bold uppercase py-3 px-6 neo-border neo-shadow hover:bg-primary hover:text-on-primary transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined">content_copy</span>
              <span>Copy Brief</span>
            </button>
            <button className="bg-secondary text-on-primary font-headline font-bold uppercase py-3 px-6 neo-border neo-shadow hover:bg-primary transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined">picture_as_pdf</span>
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        {/* Section 1: Summary & Readiness */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 bg-surface-container p-8 neo-border neo-shadow-lg">
            <h3 className="font-headline text-2xl font-bold uppercase border-b-2 border-primary pb-4 mb-4">Mission Summary</h3>
            <p className="font-body text-lg text-primary leading-relaxed">
              The objective of this mission was to aggregate and analyze customer feedback from Q2 to identify critical friction points and generate actionable technical recommendations for the Q3 roadmap. The analysis focused on user onboarding flow drop-offs and data export latency.
            </p>
          </div>
          <div className="bg-primary-container p-8 neo-border neo-shadow-lg flex flex-col items-center justify-center text-center">
            <h3 className="font-headline text-xl font-bold uppercase mb-4 text-primary">Readiness Score</h3>
            <div className="relative w-32 h-32 flex items-center justify-center rounded-full border-8 border-primary bg-background">
              <span className="font-headline text-4xl font-black text-primary">94%</span>
            </div>
            <p className="font-body text-sm font-bold mt-4 uppercase tracking-widest text-primary">High Confidence</p>
          </div>
        </section>

        {/* Example addition for more realist content based on blueprint */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-surface p-8 neo-border">
            <h3 className="font-headline text-xl font-bold uppercase border-b-2 border-primary pb-2 mb-4">Priority Findings</h3>
            <ul className="space-y-4 font-body">
              <li className="flex items-start gap-2 border-l-4 border-tertiary pl-4">
                <span className="font-bold">#1: Export Latency</span>
                <span className="block text-sm text-on-surface-variant">42% of churned users in Q2 cited slow JSON export.</span>
              </li>
              <li className="flex items-start gap-2 border-l-4 border-secondary pl-4">
                <span className="font-bold">#2: Cognitive Debt</span>
                <span className="block text-sm text-on-surface-variant">Stale documentation in `/api/export` causing failed integrations.</span>
              </li>
            </ul>
          </div>

          <div className="bg-surface-tint text-background p-8 neo-border">
            <h3 className="font-headline text-xl font-bold uppercase border-b-2 border-background pb-2 mb-4">QA Agent Validation</h3>
            <div className="font-mono text-sm space-y-2 text-[#eee9e0]">
              <p>[PASS] Source evidence linked to all findings.</p>
              <p>[PASS] CodeBot draft test passes static analysis.</p>
              <p>[PASS] No permission violations in external scrape.</p>
              <p className="mt-4 pt-4 border-t border-[#eee9e0]/30 font-bold">READY FOR ENGINEERING HANDOFF</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
