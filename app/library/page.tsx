"use client";

import { useState, useEffect } from 'react';
import { TopNav } from '@/components/TopNav';
import { fetchAllArtifactsAction } from '@/app/actions';

interface UnifiedArtifact {
  id: string;
  missionId: string;
  missionTitle: string;
  filename: string;
  type: string;
  content: string;
  createdAt: string;
}

export default function LibraryPage() {
  const [artifacts, setArtifacts] = useState<UnifiedArtifact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [selectedArtifact, setSelectedArtifact] = useState<UnifiedArtifact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadArtifacts() {
      try {
        const data = await fetchAllArtifactsAction();
        setArtifacts(data);
      } catch (err) {
        console.error("Error loading library artifacts:", err);
      } finally {
        setLoading(false);
      }
    }
    loadArtifacts();
  }, []);

  const handleDownload = (art: UnifiedArtifact) => {
    const blob = new Blob([art.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = art.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Get unique project names for filters
  const projects = Array.from(new Set(artifacts.map(a => a.missionTitle)));

  // Filter logic
  const filteredArtifacts = artifacts.filter(art => {
    const matchesSearch = art.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          art.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || art.type === filterType;
    const matchesProject = filterProject === 'all' || art.missionTitle === filterProject;
    return matchesSearch && matchesType && matchesProject;
  });

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Universal Artifact Library" />

      <main className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full p-4 md:p-8 flex flex-col gap-6">
        
        {/* Page Header */}
        <header className="border-b-4 border-primary pb-4 mb-2">
          <h1 className="font-headline text-4xl font-black uppercase tracking-tighter text-primary">Universal Library</h1>
          <p className="font-body text-sm font-semibold text-on-surface-variant border-l-4 border-tertiary pl-3 mt-1">
            Browse, search, and download all generated briefs, scripts, designs, and workspace artifacts.
          </p>
        </header>

        {/* Filters Toolbar */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-background neo-border shadow-[4px_4px_0px_0px_var(--color-primary)]">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-black uppercase text-primary mb-1.5">Search Files</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search file name or contents..."
                className="w-full bg-surface neo-border p-2 text-xs focus:outline-none focus:border-tertiary"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-primary mb-1.5">File Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full bg-surface neo-border p-2 text-xs font-bold"
            >
              <option value="all">All Formats</option>
              <option value="markdown">Markdown (.md)</option>
              <option value="code">Code Scripts (.py, .js)</option>
              <option value="json">JSON Configs</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-primary mb-1.5">Project Tag</label>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="w-full bg-surface neo-border p-2 text-xs font-bold"
            >
              <option value="all">All Projects</option>
              {projects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Artifacts List Grid */}
        <section className="flex-1">
          {loading ? (
            <div className="p-8 text-center bg-background neo-border font-mono text-sm">
              Analyzing central storage logs...
            </div>
          ) : filteredArtifacts.length === 0 ? (
            <div className="p-12 text-center bg-background neo-border text-on-surface-variant font-bold text-sm">
              No artifacts found matching the current search parameters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredArtifacts.map((art) => (
                <div key={art.id} className="bg-background neo-border neo-shadow p-5 flex flex-col justify-between min-h-[180px] group hover:bg-surface-bright transition-colors">
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className={`material-symbols-outlined text-3xl ${
                        art.type === 'code' ? 'text-secondary' : 'text-tertiary'
                      }`}>
                        {art.type === 'code' ? 'terminal' : 'description'}
                      </span>
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 border border-primary bg-primary-container text-on-primary-container truncate max-w-[70%]">
                        {art.missionTitle}
                      </span>
                    </div>
                    <h3 className="font-headline font-bold text-lg uppercase truncate mb-1" title={art.filename}>{art.filename}</h3>
                    <span className="text-[9px] text-on-surface-variant block uppercase font-bold tracking-wider mb-3">
                      Type: {art.type} • {new Date(art.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 border-t-2 border-primary pt-3 gap-2 mt-4">
                    <button 
                      onClick={() => setSelectedArtifact(art)}
                      className="p-2 border border-primary bg-surface hover:bg-primary hover:text-on-primary font-bold uppercase text-[9px] text-center transition-colors"
                    >
                      View Details
                    </button>
                    <button 
                      onClick={() => handleDownload(art)}
                      className="p-2 border border-primary bg-primary text-on-primary hover:bg-tertiary hover:text-on-tertiary font-bold uppercase text-[9px] text-center transition-colors flex justify-center items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-xs">download</span> Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Artifact Viewer Modal */}
      {selectedArtifact && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background border-4 border-primary max-w-3xl w-full max-h-[85vh] flex flex-col shadow-[8px_8px_0px_0px_var(--color-primary)]">
            <div className="p-4 border-b-4 border-primary bg-surface-container flex justify-between items-center">
              <h3 className="font-headline font-black uppercase text-sm text-primary flex items-center gap-2 truncate">
                <span className="material-symbols-outlined">description</span>
                File Inspector: {selectedArtifact.filename}
              </h3>
              <button 
                onClick={() => setSelectedArtifact(null)}
                className="w-8 h-8 neo-border bg-background flex items-center justify-center hover:bg-secondary hover:text-on-error transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-surface-container-lowest">
              <div className="font-mono text-xs p-4 border-2 border-primary bg-background whitespace-pre-wrap leading-relaxed overflow-x-auto text-on-background">
                {selectedArtifact.content}
              </div>
            </div>

            <div className="p-4 border-t-4 border-primary bg-surface-container flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase text-on-surface-variant">
                Project: {selectedArtifact.missionTitle}
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleDownload(selectedArtifact)}
                  className="bg-primary text-on-primary neo-border px-4 py-2 font-headline font-bold uppercase text-xs hover:bg-tertiary hover:text-on-tertiary transition-colors"
                >
                  Download File
                </button>
                <button 
                  onClick={() => setSelectedArtifact(null)}
                  className="bg-background text-primary neo-border px-4 py-2 font-headline font-bold uppercase text-xs hover:bg-surface-container"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
