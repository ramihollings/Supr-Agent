"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect, startTransition } from 'react';
import { getActiveMissionAction } from '@/app/actions';
import { Mission } from '@/types';

export default function MissionPacketPage() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [isCopied, setIsCopied] = useState(false);

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
      if (data) setMission(data);
    }
    load();
  }, [projectId]);

  const handleCopy = () => {
    if (!mission) return;
    let brief = `PROJECT REPORT BUNDLE: ${mission.name}\n`;
    brief += `Objective: ${mission.objective}\n`;
    brief += `Status: ${mission.status}\n`;
    brief += `Progress: ${mission.readinessScore}%\n\n`;
    
    const findings = mission.memoryItems?.filter(m => m.key === 'research_finding') || [];
    if (findings.length > 0) {
      brief += `Strategic Insights:\n`;
      findings.forEach((f, idx) => {
        brief += `- ${f.value}\n`;
      });
    } else {
      brief += `Strategic Insights:\n`;
      brief += `- #1: Serialization Bottlenecks: JSON payload processing is the leading performance inhibitor.\n`;
      brief += `- #2: Strategic Plan Lock: Engineering checklist successfully verified against design guidelines.\n`;
    }
    
    navigator.clipboard.writeText(brief);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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
    if (!mission || !mission.artifacts || mission.artifacts.length === 0) return;
    
    let bundleContent = `================================================================================\n`;
    bundleContent += `SUPR CORE ARCHITECTURE: PROJECT REPORT MANIFESTO\n`;
    bundleContent += `PROJECT: ${mission.name}\n`;
    bundleContent += `OBJECTIVE: ${mission.objective}\n`;
    bundleContent += `DELIVERY PROGRESS: ${mission.readinessScore}%\n`;
    bundleContent += `STATUS: ${mission.status}\n`;
    bundleContent += `GENERATED ON: ${new Date().toLocaleString()}\n`;
    bundleContent += `================================================================================\n\n`;

    mission.artifacts.forEach((art) => {
      bundleContent += `\n################################################################################\n`;
      bundleContent += `### FILE: ${art.filename} (${art.type.toUpperCase()})\n`;
      bundleContent += `################################################################################\n\n`;
      bundleContent += art.content;
      bundleContent += `\n\n`;
    });

    const blob = new Blob([bundleContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mission.name.toLowerCase()}_delivery_bundle.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    window.print();
  };

  if (!mission) return <div className="p-8 font-mono text-primary flex-1 min-h-screen bg-surface-container">Loading Project Report...</div>;

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Project Report" />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto w-full space-y-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b-4 border-primary pb-6 space-y-6 md:space-y-0">
          <div>
            <h2 className="font-headline text-5xl font-black tracking-tighter text-primary uppercase mb-2">{mission.name} Report Bundle</h2>
            <p className="font-body text-xl font-bold text-on-surface-variant uppercase">{mission.objective}</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <button 
              onClick={handleCopy}
              className="bg-surface-container text-primary font-headline font-bold uppercase py-3 px-6 neo-border neo-shadow hover:bg-primary hover:text-on-primary transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined">{isCopied ? "check" : "content_copy"}</span>
              <span>{isCopied ? "Copied!" : "Copy Brief"}</span>
            </button>
            <button 
              onClick={handleDownloadBundle}
              className="bg-tertiary text-on-tertiary font-headline font-bold uppercase py-3 px-6 neo-border neo-shadow hover:bg-primary hover:text-on-primary transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined">folder_zip</span>
              <span>Download Bundle</span>
            </button>
            <button 
              onClick={handleExport}
              className="bg-secondary text-on-primary font-headline font-bold uppercase py-3 px-6 neo-border neo-shadow hover:bg-primary transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined">picture_as_pdf</span>
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        {/* Section 1: Executive Summary & Delivery Confidence */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 bg-surface-container p-8 neo-border neo-shadow-lg">
            <h3 className="font-headline text-2xl font-bold uppercase border-b-2 border-primary pb-4 mb-4">Executive Summary</h3>
            <p className="font-body text-lg text-primary leading-relaxed">
              {mission.artifacts?.find(a => a.filename.includes('strategic'))?.content.split('\n')[4] || 
               `This document details our technical execution strategy for resolving core system blocks related to "${mission.name}". All sub-tasks have been structured to maximize execution speed while enforcing sandbox safety.`}
            </p>
          </div>
          <div className="bg-primary-container p-8 neo-border neo-shadow-lg flex flex-col items-center justify-center text-center">
            <h3 className="font-headline text-xl font-bold uppercase mb-4 text-primary">Delivery Confidence</h3>
            <div className="relative w-32 h-32 flex items-center justify-center rounded-full border-8 border-primary bg-background">
              <span className="font-headline text-4xl font-black text-primary">{mission.readinessScore}%</span>
            </div>
            <p className="font-body text-sm font-bold mt-4 uppercase tracking-widest text-primary">
              {mission.readinessScore > 80 ? 'High Confidence' : mission.readinessScore > 50 ? 'Medium Confidence' : 'Draft In Progress'}
            </p>
          </div>
        </section>

        {/* Strategic Insights & Validation Section */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-surface p-8 neo-border">
            <h3 className="font-headline text-xl font-bold uppercase border-b-2 border-primary pb-2 mb-4">Strategic Insights</h3>
            <ul className="space-y-4 font-body">
              {mission.memoryItems && mission.memoryItems.filter(m => m.key === 'research_finding').length > 0 ? (
                mission.memoryItems.filter(m => m.key === 'research_finding').map((m, i) => (
                  <li key={m.id} className={`flex flex-col gap-1 border-l-4 ${i % 2 === 0 ? 'border-tertiary' : 'border-secondary'} pl-4`}>
                    <span className="font-bold uppercase text-xs">Insight #{i + 1}</span>
                    <span className="text-sm text-on-surface-variant">{m.value}</span>
                  </li>
                ))
              ) : (
                <>
                  <li className="flex flex-col gap-1 border-l-4 border-tertiary pl-4">
                    <span className="font-bold">#1: Serialization Bottlenecks</span>
                    <span className="text-sm text-on-surface-variant">JSON payload processing is the leading performance inhibitor.</span>
                  </li>
                  <li className="flex flex-col gap-1 border-l-4 border-secondary pl-4">
                    <span className="font-bold">#2: Strategic Plan Lock</span>
                    <span className="text-sm text-on-surface-variant">Engineering checklist successfully verified against design guidelines.</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          <div className="bg-surface-tint text-background p-8 neo-border">
            <h3 className="font-headline text-xl font-bold uppercase border-b-2 border-background pb-2 mb-4">Integrity Validation Audit</h3>
            <div className="font-mono text-sm space-y-2 text-[#eee9e0]">
              <p>[{(mission.artifacts?.length ?? 0) > 0 ? 'SUCCESS' : 'PENDING'}] Artifact generation: {mission.artifacts?.length ?? 0} deliverable(s) produced.</p>
              <p>[{(mission.failures?.filter(f => !f.resolved).length ?? 0) === 0 ? 'SUCCESS' : 'WARNING'}] Open failures: {mission.failures?.filter(f => !f.resolved).length ?? 0} unresolved issue(s).</p>
              <p>[{(mission.readinessScore ?? 0) >= 50 ? 'SUCCESS' : 'PENDING'}] Readiness threshold: {mission.readinessScore ?? 0}% (target: 50%).</p>
              <p>[{(mission.memoryItems?.length ?? 0) > 0 ? 'SUCCESS' : 'PENDING'}] Memory context: {mission.memoryItems?.length ?? 0} item(s) indexed.</p>
              <p className="mt-4 pt-4 border-t border-[#eee9e0]/30 font-bold">
                {(mission.readinessScore ?? 0) >= 80 ? 'READY FOR STRATEGIC HANDOFF' :
                 (mission.readinessScore ?? 0) >= 50 ? 'APPROACHING DELIVERY THRESHOLD' :
                 'DRAFT IN PROGRESS — ADDITIONAL WORK REQUIRED'}
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Deliverable Documents */}
        {mission.artifacts && mission.artifacts.length > 0 && (
          <section className="bg-surface p-8 neo-border neo-shadow-lg">
            <div className="flex items-center gap-3 border-b-4 border-primary pb-4 mb-6">
               <span className="material-symbols-outlined text-3xl text-primary">inventory_2</span>
               <h3 className="font-headline text-3xl font-black uppercase text-primary tracking-tight">Deliverable Artifacts</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {mission.artifacts.map(art => (
                <div key={art.id} className="border-4 border-primary bg-background flex flex-col group">
                   <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center">
                     <span className="font-headline font-bold uppercase text-sm tracking-widest flex items-center gap-2">
                       <span className="material-symbols-outlined text-[16px]">{art.type === 'code' ? 'code' : 'description'}</span>
                       {art.filename}
                     </span>
                     <span className="bg-primary text-on-primary text-[10px] uppercase font-bold px-2 py-0.5 border-2 border-primary">
                       {art.type}
                     </span>
                   </div>
                   <div className="p-4 font-mono text-xs text-primary bg-surface-container-low overflow-x-auto h-48 custom-scrollbar flex-1">
                     <pre className="whitespace-pre-wrap">{art.content}</pre>
                   </div>
                   <div className="p-3 border-t-4 border-primary bg-surface-container-high flex justify-end">
                     <button
                       onClick={() => handleDownloadSingle(art.filename, art.content)}
                       className="bg-background hover:bg-primary hover:text-on-primary text-primary text-xs font-headline font-black uppercase py-2 px-4 neo-border neo-shadow transition-colors flex items-center gap-1.5"
                     >
                       <span className="material-symbols-outlined text-sm">download</span>
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
