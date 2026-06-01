"use client";

import { useState, useEffect, useRef } from 'react';
import { TopNav } from '@/components/TopNav';
import { ArtifactSourcePreview } from '@/components/ArtifactSourcePreview';
import { 
  fetchWorkspaceFilesAction, 
  readWorkspaceFileAction, 
  writeWorkspaceFileAction,
  deleteWorkspaceFileAction,
  fetchAllArtifactsAction,
  sendChatMessageAction
} from '@/app/actions';
import type { DashboardArtifact } from '@/types';

interface FileNode {
  name: string;
  path: string;
  size?: number;
  type: string;
  content?: string;
  origin: 'workspace' | 'deliverable';
  missionTitle?: string;
  updatedAt?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'supr';
  content: string;
}

export default function LibraryPage() {
  const [workspaceFiles, setWorkspaceFiles] = useState<FileNode[]>([]);
  const [deliverableFiles, setDeliverableFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Tree collapse state
  const [wsExpanded, setWsExpanded] = useState(true);
  const [delExpanded, setDelExpanded] = useState(true);

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 'welcome', sender: 'supr', content: 'Hello! Select a file from the list, and ask me to explain, summarize, or help you edit it.' }
  ]);
  const [isSending, setIsSending] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadLibrary = async () => {
    setLoading(true);
    try {
      // 1. Load workspace files
      const wsData = await fetchWorkspaceFilesAction();
      const wsNodes: FileNode[] = wsData.map(f => ({
        name: f.filename,
        path: `/workspace/${f.filename}`,
        size: f.size,
        type: f.type,
        origin: 'workspace',
        updatedAt: f.updatedAt
      }));
      setWorkspaceFiles(wsNodes);

      // 2. Load deliverables/artifacts from DB
      const delData = await fetchAllArtifactsAction();
      const delNodes: FileNode[] = delData.map(a => ({
        name: a.filename,
        path: `/deliverables/${a.filename}`,
        size: a.content.length, // bytes approximate
        type: a.type,
        content: a.content,
        origin: 'deliverable',
        missionTitle: a.missionTitle,
        updatedAt: a.createdAt
      }));
      setDeliverableFiles(delNodes);
    } catch (err) {
      console.error("Failed to load library resources:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const selectFile = async (node: FileNode) => {
    setIsEditing(false);
    if (node.origin === 'workspace') {
      const content = await readWorkspaceFileAction(node.name);
      const file = { ...node, content };
      setSelectedFile(file);
      setEditContent(content);
    } else {
      setSelectedFile(node);
      setEditContent(node.content || '');
    }
  };

  const handleDownload = (file: FileNode) => {
    if (!file.content) return;
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${file.name} ✓`);
  };

  const handleDownloadArtifact = (artifact: DashboardArtifact) => {
    const blob = new Blob([artifact.source], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.exportName || artifact.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${artifact.filename}`);
  };

  const selectedArtifact: DashboardArtifact | null = selectedFile ? {
    id: selectedFile.path,
    filename: selectedFile.name,
    type: selectedFile.type,
    source: selectedFile.origin === 'workspace' ? editContent : selectedFile.content || '',
    status: selectedFile.origin === 'workspace' ? 'draft' : 'approved',
    provenance: selectedFile.origin === 'workspace' ? 'Workspace file' : `Deliverable${selectedFile.missionTitle ? ` from ${selectedFile.missionTitle}` : ''}`,
    exportName: selectedFile.name,
  } : null;

  const handleCopyToClipboard = (content?: string) => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    showToast("Copied to clipboard! ✓");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const res = await writeWorkspaceFileAction(file.name, content || '');
      if (res.success) {
        showToast(`Uploaded ${file.name} to workspace!`);
        await loadLibrary();
      } else {
        showToast(`Upload failed: ${res.error}`);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveSelectedFile = async () => {
    if (!selectedFile || selectedFile.origin !== 'workspace') return;
    const res = await writeWorkspaceFileAction(selectedFile.name, editContent);
    if (res.success) {
      showToast(`Saved ${selectedFile.name}`);
      const nextFile = { ...selectedFile, content: editContent, size: editContent.length };
      setSelectedFile(nextFile);
      setIsEditing(false);
      await loadLibrary();
    } else {
      showToast(`Save failed: ${res.error}`);
    }
  };

  const handleDeleteSelectedFile = async () => {
    if (!selectedFile || selectedFile.origin !== 'workspace') return;
    if (!confirm(`Delete ${selectedFile.name} from the workspace?`)) return;
    const res = await deleteWorkspaceFileAction(selectedFile.name);
    if (res.success) {
      showToast(`Deleted ${selectedFile.name}`);
      setSelectedFile(null);
      setEditContent('');
      setIsEditing(false);
      await loadLibrary();
    } else {
      showToast(`Delete failed: ${res.error}`);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || isSending) return;
    const query = chatInput.trim();
    setChatInput('');
    setIsSending(true);

    const userMsgId = `usr-${Date.now()}`;
    setChatMessages(prev => [...prev, { id: userMsgId, sender: 'user', content: query }]);

    try {
      const fileCtx = selectedFile ? {
        name: selectedFile.name,
        type: selectedFile.type,
        content: selectedFile.content || ''
      } : undefined;

      const res = await sendChatMessageAction(query, fileCtx);
      if (res.success && res.message) {
        setChatMessages(prev => [...prev, { id: `supr-${Date.now()}`, sender: 'supr', content: res.message?.content || '' }]);
      } else {
        setChatMessages(prev => [...prev, { id: `supr-err-${Date.now()}`, sender: 'supr', content: `Error: ${res.error || 'Failed to generate response.'}` }]);
      }
    } catch (e: any) {
      setChatMessages(prev => [...prev, { id: `supr-err-${Date.now()}`, sender: 'supr', content: `Error: ${e.message}` }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Universal Library Explorer" />

      {toastMessage && (
        <div className="fixed bottom-8 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* 3-Pane Layout */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        
        {/* Left Pane: Explorer Tree */}
        <aside className="w-64 flex-none border-r-4 border-primary bg-background flex flex-col justify-between">
          <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
            <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center shrink-0">
              <span className="font-headline font-bold uppercase text-sm tracking-widest">Library Tree</span>
              <button onClick={loadLibrary} className="hover:text-primary" title="Refresh">
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>
            
            <div className="p-4 space-y-4 font-body text-xs text-on-surface-variant">
              {loading ? (
                <div className="text-center p-4 font-mono uppercase animate-pulse">Scanning central storage...</div>
              ) : (
                <div className="space-y-2">
                  
                  {/* Folder 1: Workspace */}
                  <div>
                    <div 
                      onClick={() => setWsExpanded(!wsExpanded)} 
                      className="flex items-center gap-2 py-1 px-2 font-bold text-primary cursor-pointer hover:bg-surface-container-low"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {wsExpanded ? 'folder_open' : 'folder'}
                      </span>
                      <span>/workspace</span>
                      <span className="text-[9px] bg-primary-container text-primary border border-primary px-1.5 ml-auto">
                        {workspaceFiles.length}
                      </span>
                    </div>

                    {wsExpanded && (
                      <ul className="ml-4 pl-2 border-l border-primary/20 space-y-1 mt-1">
                        {workspaceFiles.map(file => (
                          <li key={file.path}>
                            <div 
                              onClick={() => selectFile(file)}
                              className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer border ${selectedFile?.path === file.path ? 'bg-primary-container border-primary font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-transparent hover:bg-surface-container'}`}
                            >
                              <span className="material-symbols-outlined text-sm">description</span>
                              <span className="truncate max-w-[120px]">{file.name}</span>
                            </div>
                          </li>
                        ))}
                        {workspaceFiles.length === 0 && (
                          <li className="text-[10px] text-on-surface-variant italic p-2">Empty</li>
                        )}
                      </ul>
                    )}
                  </div>

                  {/* Folder 2: Deliverables */}
                  <div>
                    <div 
                      onClick={() => setDelExpanded(!delExpanded)} 
                      className="flex items-center gap-2 py-1 px-2 font-bold text-primary cursor-pointer hover:bg-surface-container-low"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {delExpanded ? 'folder_open' : 'folder'}
                      </span>
                      <span>/deliverables</span>
                      <span className="text-[9px] bg-secondary-container text-secondary border border-secondary px-1.5 ml-auto">
                        {deliverableFiles.length}
                      </span>
                    </div>

                    {delExpanded && (
                      <ul className="ml-4 pl-2 border-l border-primary/20 space-y-1 mt-1">
                        {deliverableFiles.map(file => (
                          <li key={file.path}>
                            <div 
                              onClick={() => selectFile(file)}
                              className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer border ${selectedFile?.path === file.path ? 'bg-secondary-container border-secondary font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-transparent hover:bg-surface-container'}`}
                            >
                              <span className="material-symbols-outlined text-sm">draft</span>
                              <span className="truncate max-w-[120px]" title={file.name}>{file.name}</span>
                            </div>
                          </li>
                        ))}
                        {deliverableFiles.length === 0 && (
                          <li className="text-[10px] text-on-surface-variant italic p-2">Empty</li>
                        )}
                      </ul>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>

          {/* Upload Box Area */}
          <div className="p-4 border-t-4 border-primary bg-surface-container-high shrink-0 space-y-2">
            <p className="font-headline font-bold text-[10px] uppercase text-primary">Upload File to Workspace</p>
            <input 
              type="file" 
              ref={uploadInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".py,.js,.json,.txt,.md,.csv"
            />
            <button
              onClick={() => uploadInputRef.current?.click()}
              className="w-full bg-primary text-on-primary neo-border py-2 px-3 font-headline font-bold uppercase text-[10px] hover:bg-tertiary transition-colors neo-shadow active:translate-x-0.5 active:translate-y-0.5"
            >
              <span className="material-symbols-outlined text-sm align-middle mr-1.5">upload</span>
              Choose File
            </button>
            <p className="text-[9px] text-on-surface-variant text-center font-mono">Accepts txt, py, js, md, csv</p>
          </div>
        </aside>

        {/* Center Pane: File Viewer */}
        <section className="flex-1 min-w-0 bg-background flex flex-col justify-between border-r-4 border-primary">
          {selectedArtifact && (
            <ArtifactSourcePreview
              artifact={selectedArtifact}
              isEditing={isEditing}
              editableSource={editContent}
              onSourceChange={setEditContent}
              onToggleEdit={selectedFile?.origin === 'workspace' ? () => setIsEditing((prev) => !prev) : undefined}
              onSave={selectedFile?.origin === 'workspace' ? handleSaveSelectedFile : undefined}
              onDelete={selectedFile?.origin === 'workspace' ? handleDeleteSelectedFile : undefined}
              onCopy={(content) => handleCopyToClipboard(content)}
              onDownload={handleDownloadArtifact}
            />
          )}
          {selectedFile && !selectedArtifact ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <header className="p-4 border-b-4 border-primary bg-surface-variant shrink-0 flex justify-between items-center">
                <div>
                  <h3 className="font-headline font-black text-xl uppercase truncate max-w-lg">{selectedFile.name}</h3>
                  <p className="text-[10px] text-on-surface-variant uppercase font-mono font-bold mt-1">
                    Path: {selectedFile.path} • Size: {selectedFile.size || 0} bytes 
                    {selectedFile.missionTitle ? ` • Project: ${selectedFile.missionTitle}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  {selectedFile.origin === 'workspace' && (
                    <>
                      <button
                        onClick={() => setIsEditing((prev) => !prev)}
                        className="bg-background text-primary border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase hover:bg-surface-container transition-colors"
                      >
                        {isEditing ? 'Preview' : 'Edit'}
                      </button>
                      <button
                        onClick={handleSaveSelectedFile}
                        disabled={!isEditing}
                        className="bg-secondary text-on-secondary border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase hover:bg-tertiary transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleDeleteSelectedFile}
                        className="bg-error text-on-error border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase hover:bg-primary transition-colors"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  <button 
                    onClick={() => handleCopyToClipboard(selectedFile.content)}
                    className="bg-background text-primary border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase hover:bg-surface-container transition-colors"
                  >
                    Copy
                  </button>
                  <button 
                    onClick={() => handleDownload(selectedFile)}
                    className="bg-primary text-on-primary border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase hover:bg-tertiary transition-colors"
                  >
                    Download
                  </button>
                </div>
              </header>
              <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-surface-container-lowest">
                {isEditing && selectedFile.origin === 'workspace' ? (
                  <textarea
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    className="w-full min-h-full font-mono text-xs p-5 border-2 border-primary bg-background whitespace-pre-wrap leading-relaxed overflow-x-auto text-on-background shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] focus:outline-none focus:border-tertiary resize-none"
                    spellCheck={false}
                  />
                ) : (
                  <pre className="font-mono text-xs p-5 border-2 border-primary bg-background whitespace-pre-wrap leading-relaxed overflow-x-auto text-on-background shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                    {selectedFile.content || '# Selected file is empty'}
                  </pre>
                )}
              </div>
            </div>
          ) : !selectedArtifact ? (
            <div className="flex-1 flex flex-col justify-center items-center p-8 bg-surface-container-lowest text-center">
              <span className="material-symbols-outlined text-6xl text-primary/30 mb-4 animate-bounce">folder_open</span>
              <h3 className="font-headline text-lg font-black uppercase text-primary mb-2">No File Selected</h3>
              <p className="font-body text-xs text-on-surface-variant max-w-sm">Select a document, script, or dataset from the left panel to preview it.</p>
            </div>
          ) : null}
        </section>

        {/* Right Pane: Ask Supr Chat Assistant */}
        <aside className="w-80 lg:w-96 flex-none bg-background flex flex-col h-full justify-between">
          <div className="p-3 border-b-4 border-primary bg-surface-variant shrink-0 flex items-center justify-between">
            <span className="font-headline font-bold uppercase text-xs tracking-wider flex items-center gap-1.5 text-primary">
              <span className="material-symbols-outlined text-[18px]">chat</span>
              Ask Supr Assistant
            </span>
            {selectedFile && (
              <span className="bg-primary-container text-primary border-2 border-primary px-2 py-0.5 text-[9px] font-bold uppercase truncate max-w-[120px]">
                {selectedFile.name}
              </span>
            )}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-surface-container-low">
            {chatMessages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 border-2 border-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${
                  msg.sender === 'user' 
                    ? 'bg-primary-container text-on-primary-container' 
                    : 'bg-background text-on-surface'
                }`}>
                  <p className="font-mono text-[9px] font-black uppercase tracking-wider mb-1 text-primary">
                    {msg.sender === 'user' ? 'Manager' : 'Supr Coordinator'}
                  </p>
                  <p className="font-body text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="max-w-[85%] p-3 border-2 border-primary bg-background text-on-surface shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] flex items-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                  <span className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t-4 border-primary bg-surface-container-high shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
                placeholder={selectedFile ? `Ask about ${selectedFile.name}...` : "Ask Supr about this library..."}
                className="flex-1 bg-background neo-border p-2.5 text-xs focus:outline-none focus:border-tertiary"
                disabled={isSending}
              />
              <button
                onClick={handleSendChat}
                disabled={isSending || !chatInput.trim()}
                className="bg-primary text-on-primary neo-border px-4 hover:bg-tertiary transition-colors disabled:opacity-50 flex items-center justify-center active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
              >
                <span className="material-symbols-outlined text-base">send</span>
              </button>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
