import { TopNav } from '@/components/TopNav';

export default function ActivityPage() {
  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Activity & Audit Trail" />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full">
        <header className="mb-12 border-b-4 border-primary pb-6">
          <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Activity Log</h1>
          <p className="font-body text-lg font-bold mt-2 text-on-surface-variant border-l-4 border-tertiary pl-3">Immutable audit trail of agent actions, approvals, and system events.</p>
        </header>

        <div className="bg-background neo-border p-6 shadow-md">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-8 pb-4 border-b-2 border-outline-variant">
            <select className="bg-surface neo-border px-3 py-2 font-headline font-bold uppercase text-sm">
              <option>All Agents</option>
              <option>Supr</option>
              <option>Research</option>
              <option>Code</option>
              <option>Signal</option>
            </select>
            <select className="bg-surface neo-border px-3 py-2 font-headline font-bold uppercase text-sm">
              <option>All Events</option>
              <option>Execution</option>
              <option>Approval</option>
              <option>Failure</option>
            </select>
          </div>

          {/* Timeline */}
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-outline before:to-transparent">

            {/* Event: Approval */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-primary bg-primary-container z-10 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 neo-shadow">
                <span className="material-symbols-outlined text-primary text-sm font-bold">check_circle</span>
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-surface p-4 neo-border hover:bg-white transition-colors">
                 <div className="flex justify-between items-start mb-2">
                    <span className="font-headline font-bold uppercase text-xs text-primary bg-primary-container px-2 py-0.5 border border-primary">Approval Granted</span>
                    <span className="font-body text-xs font-bold text-on-surface-variant">10:45 AM</span>
                 </div>
                 <p className="font-body font-bold text-sm">User approved scope expansion.</p>
                 <p className="font-body text-xs text-on-surface-variant mt-1">Research Agent authorized to read `abandoned_github_issues.csv`.</p>
              </div>
            </div>

            {/* Event: Failure */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group border-error/20">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-error bg-error-container z-10 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                <span className="material-symbols-outlined text-error text-sm font-bold">warning</span>
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-surface p-4 border-2 border-error hover:bg-error-container/30 transition-colors">
                 <div className="flex justify-between items-start mb-2">
                    <span className="font-headline font-bold uppercase text-xs text-error bg-error-container px-2 py-0.5 border border-error">QA Failure</span>
                    <span className="font-body text-xs font-bold text-on-surface-variant">10:22 AM</span>
                 </div>
                 <p className="font-body font-bold text-sm">Spec Agent produced invalid Brief.</p>
                 <p className="font-body text-xs text-on-surface-variant mt-1">Reason: Missing test cases. Supr issued revised guidance and incremented retry count.</p>
              </div>
            </div>

            {/* Event: Agent Action */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-primary bg-tertiary-container z-10 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                <span className="material-symbols-outlined text-tertiary text-sm font-bold">travel_explore</span>
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-surface p-4 neo-border hover:bg-white transition-colors">
                 <div className="flex justify-between items-start mb-2">
                    <span className="font-headline font-bold uppercase text-xs text-tertiary">Task Complete</span>
                    <span className="font-body text-xs font-bold text-on-surface-variant">09:15 AM</span>
                 </div>
                 <p className="font-body font-bold text-sm">Signal Agent clustered feedback.</p>
                 <p className="font-body text-xs text-on-surface-variant mt-1">Found 3 distinct pain groups from 50 support tickets.</p>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
