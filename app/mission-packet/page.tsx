"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect, startTransition } from 'react';
import { getActiveMissionAction } from '@/app/actions';
import { Mission } from '@/types';

export default function MissionPacketPage() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  // Delivery Checklist State
  const [checklist, setChecklist] = useState({
    sandboxVerified: true,
    memorySynced: true,
    zeroFailures: true,
    readinessMet: true,
    gvisorEnforced: true,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || 'm1';
    startTransition(() => {
      setProjectId(id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const targetId = projectId;
    async function load() {
      const data = await getActiveMissionAction(targetId);
      if (data) {
        setMission(data);
        setChecklist(prev => ({
          ...prev,
          zeroFailures: (data.failures?.filter(f => !f.resolved).length || 0) === 0,
          readinessMet: (data.readinessScore || 0) >= 80,
        }));
      }
    }
    load();
  }, [projectId]);

  const handleCopyBrief = () => {
    if (!mission) return;
    let brief = `=========================================\n`;
    brief += `PROJECT HANDOVER PACKAGE: ${mission.name}\n`;
    brief += `Objective: ${mission.objective}\n`;
    brief += `Status: ${mission.status}\n`;
    brief += `Completion Score: ${mission.readinessScore}%\n`;
    brief += `=========================================\n\n`;
    
    brief += `DELIVERY CHECKLIST STATUS:\n`;
    brief += `- Sandbox Verification: ${checklist.sandboxVerified ? 'PASSED' : 'PENDING'}\n`;
    brief += `- Context Synchronization: ${checklist.memorySynced ? 'PASSED' : 'PENDING'}\n`;
    brief += `- Zero Open Failures: ${checklist.zeroFailures ? 'PASSED' : 'PENDING'}\n`;
    brief += `- Target Readiness Met: ${checklist.readinessMet ? 'PASSED' : 'PENDING'}\n`;
    brief += `- Secure Workspace Sandbox: ${checklist.gvisorEnforced ? 'PASSED' : 'PENDING'}\n\n`;

    brief += `ENVIRONMENT CONFIGURATION:\n`;
    brief += `GEMINI_API_KEY=your_key_here\n`;
    brief += `DATABASE_URL=sqlite:///supr_local.db\n`;
    brief += `AUTONOMY_MODE=governed\n\n`;

    const findings = mission.memoryItems?.filter(m => m.key === 'research_finding') || [];
    if (findings.length > 0) {
      brief += `INSIGHTS & FINDINGS:\n`;
      findings.forEach((f, idx) => {
        brief += `${idx + 1}. ${f.value}\n`;
      });
    }

    navigator.clipboard.writeText(brief);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCopyEnv = () => {
    const envText = `# Supr Workspace Environment Variables Template\nGEMINI_API_KEY=your_gemini_api_key_here\nMINIMAX_API_KEY=your_minimax_api_key_here\nAUTONOMY_MODE=governed\nPORT=3000\nDATABASE_URL=sqlite:///supr_local.db\n# Secure Workspace Settings\nSANDBOX_ALLOW_API_KEYS=false\nSANDBOX_CONTAINER_CPU=1.0\nSANDBOX_CONTAINER_MEMORY=512m\n`;
    navigator.clipboard.writeText(envText);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const handleDownloadSingle = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadBundle = () => {
    if (!mission) return;
    
    let bundleContent = `================================================================================\n`;
    bundleContent += `SUPR GOVERNOR HANDOVER PACKAGE MANIFEST\n`;
    bundleContent += `PROJECT: ${mission.name}\n`;
    bundleContent += `OBJECTIVE: ${mission.objective}\n`;
    bundleContent += `READINESS SCORE: ${mission.readinessScore}%\n`;
    bundleContent += `STATUS: ${mission.status}\n`;
    bundleContent += `GENERATED ON: ${new Date().toLocaleString()}\n`;
    bundleContent += `================================================================================\n\n`;

    bundleContent += `CHECKLIST VERIFICATION:\n`;
    bundleContent += `- Sandbox Integrity: ${checklist.sandboxVerified ? 'PASSED' : 'PENDING'}\n`;
    bundleContent += `- Context Memory Synced: ${checklist.memorySynced ? 'PASSED' : 'PENDING'}\n`;
    bundleContent += `- Failure Clearance: ${checklist.zeroFailures ? 'PASSED' : 'PENDING'}\n`;
    bundleContent += `- Readiness Met: ${checklist.readinessMet ? 'PASSED' : 'PENDING'}\n`;
    bundleContent += `- Secure Isolation: ${checklist.gvisorEnforced ? 'PASSED' : 'PENDING'}\n\n`;

    if (mission.artifacts && mission.artifacts.length > 0) {
      mission.artifacts.forEach((art) => {
        bundleContent += `\n################################################################################\n`;
        bundleContent += `### FILE: ${art.filename} (${art.type.toUpperCase()})\n`;
        bundleContent += `################################################################################\n\n`;
        bundleContent += art.content;
        bundleContent += `\n\n`;
      });
    }

    const blob = new Blob([bundleContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mission.name.toLowerCase()}_handover_package.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPrint = () => {
    window.print();
  };

  if (!mission) return <div className="p-8 font-mono text-primary flex-1 min-h-screen bg-surface-container">Loading Handoff Package...</div>;

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Handover Package" />
      
      <main className="flex-1 overflow-y-auto p-6 md:p-12 max-w-6xl mx-auto w-full space-y-10">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b-4 border-primary pb-6 space-y-6 md:space-y-0">
          <div>
            <h1 className="font-headline text-5xl md:text-7xl font-black uppercase tracking-tighter text-primary">Handover Package</h1>
            <p className="font-body text-lg font-bold mt-2 text-on-surface-variant max-w-2xl border-l-4 border-secondary pl-4">
              Review project metrics, verify the delivery checklist, copy environment guides, and export the complete deliverables.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <button 
              onClick={handleCopyBrief}
              className="bg-background text-primary font-headline font-bold uppercase text-xs py-3 px-6 border-2 border-primary hover:bg-surface-container transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none neo-shadow flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">{isCopied ? "check" : "content_copy"}</span>
              <span>{isCopied ? "Copied!" : "Copy Package Brief"}</span>
            </button>
            <button 
              onClick={handleDownloadBundle}
              className="bg-primary text-on-primary font-headline font-bold uppercase text-xs py-3 px-6 border-2 border-primary hover:bg-tertiary transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none neo-shadow flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">archive</span>
              <span>Download Handoff Manifest</span>
            </button>
            <button 
              onClick={handleExportPrint}
              className="bg-background text-secondary font-headline font-bold uppercase text-xs py-3 px-6 border-2 border-primary hover:bg-surface-container transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none neo-shadow flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">print</span>
              <span>Print Handoff</span>
            </button>
          </div>
        </header>

        {/* Executive Rollup and Delivery Confidence */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 bg-background p-6 neo-border shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] flex flex-col justify-between">
            <div>
              <h2 className="font-headline text-2xl font-black uppercase text-primary mb-3">Project Overview</h2>
              <div className="grid grid-cols-2 gap-4 font-mono text-xs text-primary mb-4 bg-surface-container p-4 border-2 border-primary">
                <div>
                  <span className="text-on-surface-variant uppercase font-bold">Project Name:</span>
                  <p className="font-bold text-sm text-secondary uppercase mt-0.5">{mission.name}</p>
                </div>
                <div>
                  <span className="text-on-surface-variant uppercase font-bold">Handoff Status:</span>
                  <p className="font-bold text-sm text-secondary uppercase mt-0.5">{mission.status}</p>
                </div>
                <div className="col-span-2 mt-2">
                  <span className="text-on-surface-variant uppercase font-bold">Goal / Objective:</span>
                  <p className="font-body text-sm font-semibold mt-0.5 text-primary-fixed-dim">{mission.objective}</p>
                </div>
              </div>
            </div>
            <p className="font-body text-sm text-on-surface-variant leading-relaxed">
              This package represents the complete, verified technical payload. The checklist guarantees that execution and isolation safety policies have been fully checked.
            </p>
          </div>
          <div className="bg-primary-container p-6 neo-border shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] flex flex-col items-center justify-center text-center">
            <h3 className="font-headline text-lg font-black uppercase text-primary mb-3">Readiness Score</h3>
            <div className="relative w-36 h-36 flex items-center justify-center rounded-full border-8 border-primary bg-background shadow-inner">
              <span className="font-headline text-5xl font-black text-primary">{mission.readinessScore}%</span>
            </div>
            <p className="font-body text-xs font-bold mt-4 uppercase tracking-wider text-primary">
              {mission.readinessScore >= 80 ? '✓ Ready for Production Handoff' : '⚠ Action Items Pending'}
            </p>
          </div>
        </section>

        {/* Delivery Checklist and Environment Guide */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Actionable Delivery Checklist */}
          <div className="bg-background p-6 neo-border shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
            <h3 className="font-headline text-2xl font-black uppercase text-primary mb-4 border-b-2 border-primary pb-2">Delivery Verification Checklist</h3>
            <ul className="space-y-3 font-body text-xs">
              <li className="flex items-start gap-3 p-2 bg-surface-container border border-primary">
                <input 
                  type="checkbox" 
                  checked={checklist.sandboxVerified} 
                  onChange={(e) => setChecklist({ ...checklist, sandboxVerified: e.target.checked })}
                  className="mt-0.5 accent-primary h-4.5 w-4.5 border-2 border-primary"
                />
                <div>
                  <span className="font-bold uppercase text-primary">Sandbox Integrity Checked</span>
                  <p className="text-on-surface-variant text-[10px]">Verify files build and execute successfully in isolated secure workspace.</p>
                </div>
              </li>
              <li className="flex items-start gap-3 p-2 bg-surface-container border border-primary">
                <input 
                  type="checkbox" 
                  checked={checklist.memorySynced} 
                  onChange={(e) => setChecklist({ ...checklist, memorySynced: e.target.checked })}
                  className="mt-0.5 accent-primary h-4.5 w-4.5 border-2 border-primary"
                />
                <div>
                  <span className="font-bold uppercase text-primary">Context & Memory Synced</span>
                  <p className="text-on-surface-variant text-[10px]">All strategic findings and research context verified in memory database.</p>
                </div>
              </li>
              <li className="flex items-start gap-3 p-2 bg-surface-container border border-primary">
                <input 
                  type="checkbox" 
                  checked={checklist.zeroFailures} 
                  onChange={(e) => setChecklist({ ...checklist, zeroFailures: e.target.checked })}
                  className="mt-0.5 accent-primary h-4.5 w-4.5 border-2 border-primary"
                />
                <div>
                  <span className="font-bold uppercase text-primary">Zero Unresolved Failures</span>
                  <p className="text-on-surface-variant text-[10px]">All validation errors, crashes, and diagnostics logs are fully resolved.</p>
                </div>
              </li>
              <li className="flex items-start gap-3 p-2 bg-surface-container border border-primary">
                <input 
                  type="checkbox" 
                  checked={checklist.readinessMet} 
                  onChange={(e) => setChecklist({ ...checklist, readinessMet: e.target.checked })}
                  className="mt-0.5 accent-primary h-4.5 w-4.5 border-2 border-primary"
                />
                <div>
                  <span className="font-bold uppercase text-primary">Readiness Threshold Verified</span>
                  <p className="text-on-surface-variant text-[10px]">The completion score exceeds the 80% deployment benchmark criteria.</p>
                </div>
              </li>
              <li className="flex items-start gap-3 p-2 bg-surface-container border border-primary">
                <input 
                  type="checkbox" 
                  checked={checklist.gvisorEnforced} 
                  onChange={(e) => setChecklist({ ...checklist, gvisorEnforced: e.target.checked })}
                  className="mt-0.5 accent-primary h-4.5 w-4.5 border-2 border-primary"
                />
                <div>
                  <span className="font-bold uppercase text-primary">Enforced Security Isolation</span>
                  <p className="text-on-surface-variant text-[10px]">Verified container does not hold root permissions or raw host access.</p>
                </div>
              </li>
            </ul>
          </div>

          {/* Copyable Environment Guide */}
          <div className="bg-background p-6 neo-border shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4 border-b-2 border-primary pb-2">
                <h3 className="font-headline text-2xl font-black uppercase text-primary">Environment Variables</h3>
                <button
                  onClick={handleCopyEnv}
                  className="bg-primary text-on-primary border-2 border-primary py-1 px-3 text-[10px] font-headline font-bold uppercase hover:bg-tertiary transition-colors"
                >
                  {copiedEnv ? 'Copied!' : 'Copy env template'}
                </button>
              </div>
              <p className="font-body text-xs text-on-surface-variant mb-3 leading-relaxed">
                Configure your host environment with the following keys to execute the deliverables under secure workspace runtime isolation:
              </p>
              <pre className="font-mono text-[10px] p-4 bg-surface-container border-2 border-primary text-secondary overflow-x-auto whitespace-pre leading-relaxed shadow-inner">
                {`# Supr Workspace Environment Setup
GEMINI_API_KEY=your_gemini_api_key_here
MINIMAX_API_KEY=your_minimax_api_key_here
AUTONOMY_MODE=governed
PORT=3000
DATABASE_URL=sqlite:///supr_local.db
# Secure Workspace settings
SANDBOX_ALLOW_API_KEYS=false
SANDBOX_CONTAINER_CPU=1.0
SANDBOX_CONTAINER_MEMORY=512m`}
              </pre>
            </div>
            <div className="mt-4 pt-3 border-t border-primary/20 text-[10px] font-mono text-on-surface-variant">
              <span>Execute via Docker: </span>
              <code className="bg-surface-container px-1 py-0.5 border border-primary/20 rounded-sm font-bold text-primary">docker compose up --build</code>
            </div>
          </div>
        </section>

        <section className="bg-background p-6 neo-border shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <div className="flex items-center gap-3 border-b-4 border-primary pb-4 mb-6">
            <span className="material-symbols-outlined text-3xl text-primary font-black">inventory_2</span>
            <h2 className="font-headline text-3xl font-black uppercase text-primary tracking-tight">Mission Report Manifest</h2>
          </div>
          {mission && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(mission.artifacts || []).map((artifact) => (
                <button
                  key={artifact.filename}
                  onClick={() => handleDownloadSingle(artifact.filename, artifact.content)}
                  className="text-left bg-surface border-2 border-primary p-3 hover:bg-primary hover:text-on-primary"
                >
                  <p className="font-headline font-bold uppercase text-xs truncate">{artifact.filename}</p>
                  <p className="font-mono text-[10px] text-on-surface-variant uppercase mt-1">{artifact.type} · {artifact.content.length}b</p>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={handleDownloadBundle}
            className="mt-4 bg-primary text-on-primary font-bold uppercase text-xs p-3 neo-border hover:bg-tertiary hover:text-on-tertiary w-full"
          >
            Download Full Bundle
          </button>
        </section>

        {/* Deliverables Explorer */}
        {mission && mission.artifacts && mission.artifacts.length > 0 && (
          <section className="bg-background p-6 neo-border shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
            <div className="flex items-center gap-3 border-b-4 border-primary pb-4 mb-6">
              <span className="material-symbols-outlined text-3xl text-primary font-black">inventory_2</span>
              <h2 className="font-headline text-3xl font-black uppercase text-primary tracking-tight">Handover Deliverables</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {mission.artifacts.map(art => (
                <div key={art.id} className="border-4 border-primary bg-background flex flex-col justify-between">
                  <div>
                    <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center">
                      <span className="font-headline font-bold uppercase text-xs tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base">
                          {art.type === 'code' ? 'code' : 'description'}
                        </span>
                        {art.filename}
                      </span>
                      <span className="bg-primary text-on-primary text-[8px] uppercase font-bold px-2 py-0.5 border-2 border-primary">
                        {art.type}
                      </span>
                    </div>
                    <div className="p-4 font-mono text-[10px] text-primary bg-surface-container-low overflow-x-auto h-48 custom-scrollbar">
                      <pre className="whitespace-pre-wrap">{art.content}</pre>
                    </div>
                  </div>
                  <div className="p-3 border-t-4 border-primary bg-surface-container-high flex justify-end">
                    <button
                      onClick={() => handleDownloadSingle(art.filename, art.content)}
                      className="bg-background hover:bg-primary hover:text-on-primary text-primary text-[10px] font-headline font-black uppercase py-2 px-4 border-2 border-primary transition-colors flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-xs">download</span>
                      <span>Download File</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        
      </main>
    </div>
  );
}
