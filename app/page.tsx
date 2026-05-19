"use client";

import { TopNav } from '@/components/TopNav';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { MissionWizard } from '@/components/MissionWizard';
import { fetchMissionsAction } from '@/app/actions';
import { Mission } from '@/types';

export default function WorkspacePage() {
  const [showWizard, setShowWizard] = useState(false);
  const [projects, setProjects] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await fetchMissionsAction();
        setProjects(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, []);

  const handleNewMission = () => {
    setShowWizard(true);
  };

  const handleWizardClose = async () => {
    setShowWizard(false);
    // Refresh project list after wizard closes (new project may have been created)
    try {
      const data = await fetchMissionsAction();
      setProjects(data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container relative">
      {showWizard && <MissionWizard onClose={handleWizardClose} />}
      <TopNav title="Dashboard Overview" />
      
      <div className="p-6 lg:p-8 flex-1 overflow-y-auto space-y-8 max-w-7xl mx-auto w-full">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-4 border-primary pb-6">
          <div>
            <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Dashboard</h1>
            <p className="font-body text-lg font-bold mt-2 text-on-surface-variant border-l-4 border-tertiary pl-3">Active projects, deliverable artifacts, and agent operation telemetry.</p>
          </div>
          <div className="relative">
            <button 
              onClick={handleNewMission}
              className="bg-primary text-on-primary neo-border neo-shadow font-headline font-bold uppercase py-3 px-6 hover:bg-primary-fixed hover:text-primary transition-all active:translate-x-1 active:translate-y-1"
            >
              <span className="flex items-center gap-2"><span className="material-symbols-outlined">add</span> New Project</span>
            </button>
          </div>
        </header>

        {/* Active Projects */}
        <section>
          <h2 className="font-headline text-2xl font-black uppercase tracking-tight mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary">rocket_launch</span> Active Projects
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {loading ? (
              <div className="font-mono text-sm text-on-surface-variant p-6 bg-background neo-border">Loading projects...</div>
            ) : projects.length > 0 ? (
              projects.map(proj => (
                <div key={proj.id} className="bg-background neo-border neo-shadow p-6 group cursor-pointer hover:bg-surface-bright transition-colors flex flex-col justify-between min-h-[220px]">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <Link href={`/mission-control?id=${proj.id}`} className="font-headline text-2xl font-bold uppercase group-hover:text-tertiary transition-colors">
                        {proj.name}
                      </Link>
                      <span className={`px-3 py-1 font-body text-xs font-bold uppercase neo-border ${
                        proj.status === 'Active' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-variant text-on-surface-variant'
                      }`}>
                        {proj.status === 'Active' ? 'In Progress' : 'Completed'}
                      </span>
                    </div>
                    <p className="font-body text-sm text-on-surface-variant mb-6 line-clamp-2">
                      {proj.objective || 'No objective defined.'}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between border-t-2 border-outline-variant pt-4">
                    <div className="flex -space-x-2">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center neo-border z-30" title="Supr Planner"><span className="material-symbols-outlined text-on-primary text-sm">psychology</span></div>
                      <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center neo-border z-20" title="Research Agent"><span className="material-symbols-outlined text-primary text-sm">travel_explore</span></div>
                      <div className="w-8 h-8 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center neo-border z-10" title="Signal Agent"><span className="material-symbols-outlined tracking-tighter text-sm">sensors</span></div>
                    </div>
                    <div className="text-right">
                      <span className="font-headline font-bold text-xs uppercase text-on-surface-variant block">Delivery Progress</span>
                      <span className="font-headline font-black text-2xl text-secondary">{proj.readinessScore || 0}%</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-background neo-border p-6 text-on-surface-variant font-bold text-sm">No active projects found. Create a new one to begin!</div>
            )}

            <button 
              onClick={handleNewMission}
              className="bg-surface-variant neo-border p-6 shadow-sm opacity-80 border-dashed hover:bg-surface-container hover:opacity-100 transition-all text-left"
            >
               <div className="flex items-center justify-center h-full min-h-[220px] text-on-surface-variant">
                  <p className="font-headline font-bold uppercase text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined">add_circle</span> Initialize New Project
                  </p>
               </div>
            </button>
          </div>
        </section>

        {/* Deliverable Repositories / Recent Artifacts */}
        <section>
          <h2 className="font-headline text-2xl font-black uppercase tracking-tight mb-4 border-b-4 border-primary pb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">folder_open</span> Document & Artifact Repository
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {projects.slice(0, 3).map((proj, idx) => {
               // Find any artifact or default to a mock
               const targetArtifact = proj.artifacts?.[0];
               const artifactTitle = targetArtifact?.filename || `${proj.name} Execution Plan`;
               const artifactDesc = targetArtifact ? `${proj.name} deliverable spec.` : `Checklist and findings summary.`;
               
               return (
                 <Link 
                   key={proj.id} 
                   href={`/mission-packet?id=${proj.id}`} 
                   className="bg-background neo-border p-5 hover:bg-surface transition-colors hover:neo-shadow-lg flex flex-col justify-between gap-4 min-h-[160px]"
                 >
                    <div className="flex items-center justify-between">
                      <span className={`material-symbols-outlined text-3xl ${idx % 3 === 0 ? 'text-secondary' : idx % 3 === 1 ? 'text-tertiary' : 'text-primary'}`}>
                        {targetArtifact?.type === 'code' ? 'terminal' : 'description'}
                      </span>
                      <span className="text-xs font-bold uppercase text-on-surface-variant">Project Report</span>
                    </div>
                    <div>
                      <h3 className="font-headline font-bold uppercase truncate">{artifactTitle}</h3>
                      <p className="font-body text-xs mt-1 text-on-surface-variant line-clamp-2">{artifactDesc}</p>
                    </div>
                 </Link>
               );
             })}
          </div>
        </section>

      </div>
    </div>
  );
}
