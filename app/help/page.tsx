import { TopNav } from '@/components/TopNav';

export default function HelpPage() {
  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Documentation & Help" />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full">
        <header className="mb-12 border-b-4 border-primary pb-6">
          <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Supr Manual</h1>
          <p className="font-body text-lg font-bold mt-2 text-on-surface-variant border-l-4 border-tertiary pl-3">Operating guidelines for the governed AI supervisor workspace.</p>
        </header>

        <section className="space-y-8">
          
          <article className="bg-background neo-border p-6">
            <h2 className="font-headline text-2xl font-bold uppercase mb-4 text-primary border-b-2 border-primary pb-2 flex items-center gap-2">
              <span className="material-symbols-outlined">school</span> Core Principles
            </h2>
            <div className="font-body text-sm space-y-4">
              <p><strong className="uppercase">1. Supervisor First:</strong> Supr is not a generic assistant. It is a project supervisor. You give Supr a mission, and Supr builds the Glidepath, assigns agents, and manages execution.</p>
              <p><strong className="uppercase">2. Secure Delegation:</strong> Subagents cannot commit actions to the core workspace without Supr's review, or your approval if the permissions dictate.</p>
              <p><strong className="uppercase">3. Transparent Reasoning:</strong> Any action taken autonomously will be recorded in the Decision Matrix (Reasoning tab) outlining exactly why Supr allowed it.</p>
            </div>
          </article>

          <article className="bg-surface neo-border border-dashed p-6">
            <h2 className="font-headline text-2xl font-bold uppercase mb-4 text-primary border-b-2 border-outline-variant pb-2 flex items-center gap-2">
              <span className="material-symbols-outlined">support_agent</span> Contacting Support
            </h2>
            <p className="font-body text-sm mb-4">If the Supr instance enters a Crash Loop or fails to parse a valid Mission Packet, please escalate to Human Engineering.</p>
            <button className="bg-primary text-on-primary neo-border py-2 px-6 font-headline font-bold uppercase hover:bg-tertiary transition-colors">
              Submit Ticket
            </button>
          </article>

        </section>
      </main>
    </div>
  );
}
