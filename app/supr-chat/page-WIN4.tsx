"use client";

import { useState, useEffect, useRef } from 'react';
import { TopNav } from '@/components/TopNav';
import { 
  fetchChatMessagesAction, 
  sendChatMessageAction, 
  fetchWorkspaceFilesAction,
  readWorkspaceFileAction,
  writeWorkspaceFileAction,
  deleteWorkspaceFileAction,
  executeCodeAction,
  fetchSettingsAction,
  updateSettingAction,
  fetchMissionsAction
} from '@/app/actions';

interface ChatMessage {
  id: string;
  sender: 'user' | 'supr';
  content: string;
  file: {
    name: string;
    type: string;
    content: string;
  } | null;
  createdAt: string;
}

interface WorkspaceFile {
  filename: string;
  size: number;
  updatedAt: string;
  type: string;
}

export default function SuprChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings states (Toggles saved to Settings DB)
  const [activeModel, setActiveModel] = useState('gemini');
  const [temperature, setTemperature] = useState('0.7');
  const [autonomyMode, setAutonomyMode] = useState('guided');

  // File Upload states
  const [selectedFile, setSelectedFile] = useState<{ name: string; type: string; content: string } | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Side-Canvas Workspace States
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasTab, setCanvasTab] = useState<'preview' | 'run' | 'explorer'>('explorer');
  const [canvasFile, setCanvasFile] = useState<{ filename: string; content: string } | null>(null);
  
  // Workspace files explorer list
  const [wsFiles, setWsFiles] = useState<WorkspaceFile[]>([]);
  const [runLoading, setRunLoading] = useState(false);
  const [runOutput, setRunOutput] = useState<{ success: boolean; stdout?: string; stderr?: string; error?: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (canvasOpen && canvasTab === 'explorer') {
      loadWorkspace();
      const interval = setInterval(loadWorkspace, 10000); // 10s is plenty and reduces network and layout lag
      return () => clearInterval(interval);
    }
  }, [canvasOpen, canvasTab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadData = async () => {
    const [msgs, settings, projectsList, filesList] = await Promise.all([
      fetchChatMessagesAction(),
      fetchSettingsAction(),
      fetchMissionsAction(),
      fetchWorkspaceFilesAction()
    ]);
    
    let processedMsgs = [...msgs];
    
    // Check if the chat history is empty or has only the initial database seed message.
    // If so, replace/insert a dynamic greeting containing system telemetry details.
    if (processedMsgs.length <= 1) {
      const activeProjCount = projectsList.filter(p => p.status === 'Active').length;
      const fileCount = filesList.length;
      
      const welcomeText = `Hello Manager! I am Supr, your central coordinator. 
I have initialized our secure session. 

**Current System Telemetry:**
*   **Active Projects:** ${activeProjCount} project(s) currently under management.
*   **Sandbox Workspace:** ${fileCount} file(s) registered in \`./supr_workspaces/\`.
*   **Autonomy Clearance:** ${settings.operating_mode || 'guided'} mode active.

How can I assist you with your tasks today? You can ask me to run workspace scripts, generate images, or fetch project updates.`;

      if (processedMsgs.length === 0) {
        processedMsgs = [{
          id: 'welcome-msg',
          sender: 'supr',
          content: welcomeText,
          file: null,
          createdAt: new Date().toISOString()
        }];
      } else if (processedMsgs[0].id === 'init-chat-msg') {
        processedMsgs[0] = {
          ...processedMsgs[0],
          content: welcomeText
        };
      }
    }
    
    setMessages(processedMsgs);
    if (settings.llm_provider_supr) setActiveModel(settings.llm_provider_supr);
    if (settings.operating_mode) setAutonomyMode(settings.operating_mode);
    if (settings.llm_temperature_supr) setTemperature(settings.llm_temperature_supr);
  };

  const loadWorkspace = async () => {
    const files = await fetchWorkspaceFilesAction();
    setWsFiles(files);
  };

  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    const reader = new FileReader();

    // Check if the file is text or image/binary
    const isText = file.type.startsWith('text/') || 
                   file.name.endsWith('.js') || 
                   file.name.endsWith('.ts') || 
                   file.name.endsWith('.py') || 
                   file.name.endsWith('.json') || 
                   file.name.endsWith('.csv') ||
                   file.name.endsWith('.md');

    reader.onload = () => {
      setSelectedFile({
        name: file.name,
        type: file.type || 'application/octet-stream',
        content: reader.result as string
      });
      setUploadLoading(false);
    };

    if (isText) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file); // Image/PDF read as base64 DataURL
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    setChatLoading(true);
    const textToSend = inputText;
    const fileToSend = selectedFile || undefined;
    
    setInputText('');
    setSelectedFile(null);

    // Refresh immediately to show user message
    setMessages(prev => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        sender: 'user',
        content: textToSend,
        file: fileToSend || null,
        createdAt: new Date().toISOString()
      }
    ]);

    const res = await sendChatMessageAction(textToSend, fileToSend);
    if (res.success) {
      if (res.shadow && res.message) {
        // In Shadow Mode, append both user and supr messages locally
        setMessages(prev => {
          const filtered = prev.filter(m => !m.id.startsWith('temp-'));
          return [
            ...filtered,
            {
              id: `shadow-user-${Date.now()}`,
              sender: 'user',
              content: textToSend,
              file: fileToSend || null,
              createdAt: new Date().toISOString()
            },
            res.message as any
          ];
        });
      } else {
        await loadData();
        await loadWorkspace();
      }
    } else {
      alert(`Chat execution failed: ${res.error}`);
    }
    setChatLoading(false);
  };

  const handleApplyChatSettings = async () => {
    await Promise.all([
      updateSettingAction('llm_provider_supr', activeModel),
      updateSettingAction('operating_mode', autonomyMode),
      updateSettingAction('llm_temperature_supr', temperature)
    ]);
    setShowSettings(false);
  };

  // Open Canvas File
  const handleOpenFile = async (filename: string) => {
    const content = await readWorkspaceFileAction(filename);
    setCanvasFile({ filename, content });
    setCanvasTab('preview');
    setCanvasOpen(true);
    setRunOutput(null);
  };

  // Save Canvas File
  const handleSaveFile = async (content: string) => {
    if (!canvasFile) return;
    const res = await writeWorkspaceFileAction(canvasFile.filename, content);
    if (res.success) {
      alert(`Saved ${canvasFile.filename} successfully!`);
      setCanvasFile({ filename: canvasFile.filename, content });
      loadWorkspace();
    }
  };

  // Run Canvas File
  const handleRunFile = async () => {
    if (!canvasFile) return;
    setRunLoading(true);
    setRunOutput(null);
    setCanvasTab('run');
    
    const res = await executeCodeAction(canvasFile.filename, canvasFile.filename.endsWith('.py') ? 'python' : 'javascript');
    setRunOutput(res);
    setRunLoading(false);
  };

  // Delete File
  const handleDeleteFile = async (filename: string) => {
    if (confirm(`Are you sure you want to delete ${filename}?`)) {
      const res = await deleteWorkspaceFileAction(filename);
      if (res.success) {
        loadWorkspace();
        if (canvasFile?.filename === filename) {
          setCanvasFile(null);
          setCanvasOpen(false);
        }
      }
    }
  };

  // Create new workspace file
  const handleCreateNewFile = async () => {
    const filename = prompt("Enter file name (e.g. script.py, data.json):");
    if (!filename) return;
    const res = await writeWorkspaceFileAction(filename, `# New Supr Sandbox Document\n`);
    if (res.success) {
      loadWorkspace();
      handleOpenFile(filename);
    }
  };

  // Separate simulated telemetry blocks from regular chat text
  const parseMessageContent = (content: string) => {
    const telemetryRegex = /```telemetry\n([\s\S]*?)```\n*/g;
    const match = telemetryRegex.exec(content);
    
    if (match) {
      const logs = match[1].trim();
      const text = content.replace(telemetryRegex, '').trim();
      return { logs, text };
    }
    return { logs: null, text: content };
  };

  return (
    <div className="flex-1 md:ml-64 flex min-h-screen bg-surface-container relative overflow-hidden">
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-screen min-w-0 bg-surface-container relative">
        
        {/* Unobtrusive Topnav / Custom Header */}
        <header className="flex-none h-16 border-b-4 border-primary bg-background flex justify-between items-center px-4 lg:px-6 relative z-30">
          <div className="flex items-center space-x-4">
            <span className="material-symbols-outlined text-primary text-2xl">chat</span>
            <h2 className="font-headline font-bold text-lg md:text-xl uppercase tracking-tight">Supr-Chat</h2>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Toggle Canvas Button */}
            <button 
              onClick={() => setCanvasOpen(!canvasOpen)}
              className={`p-2 border-2 border-primary flex items-center justify-center hover:bg-surface-container ${
                canvasOpen ? 'bg-primary text-on-primary' : 'bg-background'
              }`}
              title="Toggle Workspace Canvas"
            >
              <span className="material-symbols-outlined text-sm">side_navigation</span>
            </button>

            {/* Quick-Settings Header Dropdown (Afterthought Settings) */}
            <div className="relative">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 border-2 border-primary bg-background flex items-center justify-center hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-sm">settings</span>
              </button>
              
              {showSettings && (
                <div className="absolute right-0 mt-2 w-80 bg-background border-4 border-primary p-4 neo-shadow-lg z-50 text-xs">
                  <h4 className="font-headline font-black uppercase text-primary border-b-2 border-primary pb-2 mb-3">Chat Controls</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[9px] font-black uppercase text-on-surface-variant mb-1">Model Provider</label>
                      <select 
                        value={activeModel} 
                        onChange={(e) => setActiveModel(e.target.value)}
                        className="w-full bg-surface neo-border p-1.5 font-bold"
                      >
                        <option value="default">Default (Global Flow)</option>
                        <option value="gemini">Gemini 2.0 Flash</option>
                        <option value="minimax">MiniMax M2.7</option>
                        <option value="openai_compat">OpenAI-Compatible</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-black uppercase text-on-surface-variant mb-1">Autonomy clearance</label>
                      <select 
                        value={autonomyMode} 
                        onChange={(e) => setAutonomyMode(e.target.value)}
                        className="w-full bg-surface neo-border p-1.5 font-bold"
                      >
                        <option value="guided">Guided (Confirm Steps)</option>
                        <option value="supervisor">Supervisor (Managed)</option>
                        <option value="autonomous">Full Autonomy</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-black uppercase text-on-surface-variant mb-1">Temperature ({temperature})</label>
                      <input 
                        type="range" 
                        min="0.1" 
                        max="1.0" 
                        step="0.1" 
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value)}
                        className="w-full accent-primary" 
                      />
                    </div>

                    <button 
                      onClick={handleApplyChatSettings}
                      className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border hover:bg-tertiary transition-colors"
                    >
                      Apply Controls
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
          {messages.map((msg) => {
            const { logs, text } = parseMessageContent(msg.content);
            const isUser = msg.sender === 'user';
            
            return (
              <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-4xl ${isUser ? 'ml-auto' : 'mr-auto'} w-full`}>
                
                {/* 1. File Attachment Rendering */}
                {msg.file && (
                  <div className={`mb-2 p-3 neo-border bg-background max-w-sm flex items-center gap-3 shadow-[2px_2px_0px_0px_var(--color-primary)]`}>
                    <span className="material-symbols-outlined text-secondary text-2xl">
                      {msg.file.type.startsWith('image/') ? 'image' : 'description'}
                    </span>
                    <div className="overflow-hidden">
                      <p className="font-bold text-xs uppercase truncate">{msg.file.name}</p>
                      <p className="text-[9px] text-on-surface-variant truncate">{msg.file.type}</p>
                    </div>
                  </div>
                )}

                {/* 2. Simulation / Telemetry Log Console (Inside the bubble flow) */}
                {logs && (
                  <div className="w-full max-w-lg mb-3 neo-border bg-black text-green-400 font-mono text-[10px] leading-relaxed p-4 shadow-[3px_3px_0px_0px_var(--color-primary)]">
                    <div className="flex items-center gap-2 mb-2 border-b border-green-950 pb-1.5 text-green-500 font-bold uppercase text-[9px]">
                      <span className="material-symbols-outlined animate-spin text-[12px]">sync</span>
                      Task Force Telemetry Logs
                    </div>
                    <pre className="whitespace-pre-wrap">{logs}</pre>
                  </div>
                )}

                {/* 3. Text Message Bubble */}
                <div className={`p-4 neo-border font-body text-sm leading-relaxed max-w-2xl ${
                  isUser 
                    ? 'bg-primary text-on-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,0.15)]' 
                    : 'bg-background text-on-background shadow-[4px_4px_0px_0px_var(--color-primary)]'
                }`}>
                  
                  {/* Handle inline generated images */}
                  {msg.file?.type.startsWith('image/') && msg.file.content ? (
                    <div className="mb-3 neo-border bg-surface overflow-hidden max-w-md">
                      <img 
                        src={msg.file.content.startsWith('data:') ? msg.file.content : `data:image/png;base64,${msg.file.content}`} 
                        alt="Supr generated illustration" 
                        className="w-full object-contain max-h-[300px]"
                      />
                    </div>
                  ) : null}

                  <div className="whitespace-pre-wrap">{text}</div>
                </div>
                
                <span className="text-[8px] text-on-surface-variant font-mono mt-1 px-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            );
          })}
          
          {chatLoading && (
            <div className="flex items-center gap-3 p-4 max-w-sm neo-border bg-background shadow-[4px_4px_0px_0px_var(--color-primary)]">
              <span className="material-symbols-outlined animate-spin text-primary">sync</span>
              <span className="font-headline font-bold text-xs uppercase text-primary">Supr is orchestrating...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Dock */}
        <div className="flex-none p-4 md:p-6 border-t-4 border-primary bg-background z-20">
          <form onSubmit={handleSend} className="max-w-4xl mx-auto flex flex-col gap-3">
            
            {/* Selected File Preview Box */}
            {selectedFile && (
              <div className="flex items-center justify-between p-2.5 neo-border bg-surface-container max-w-md text-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="material-symbols-outlined text-secondary">
                    {selectedFile.type.startsWith('image/') ? 'image' : 'description'}
                  </span>
                  <span className="font-bold truncate">{selectedFile.name}</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setSelectedFile(null)}
                  className="text-error font-bold uppercase hover:underline text-[10px]"
                >
                  Remove
                </button>
              </div>
            )}

            <div className="flex gap-3">
              {/* Attachment Button */}
              <button 
                type="button" 
                onClick={handleFileUploadClick}
                disabled={uploadLoading}
                className="px-4 py-3 neo-border bg-background hover:bg-surface-container flex items-center justify-center transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined">attachment</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden" 
              />

              {/* Message input */}
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask Supr to fetch data, generate image, draft mail, create sandbox code..."
                disabled={chatLoading}
                className="flex-1 bg-surface neo-border px-4 py-3 font-body text-sm focus:outline-none focus:border-tertiary disabled:opacity-50"
              />

              {/* Submit */}
              <button 
                type="submit"
                disabled={chatLoading || (!inputText.trim() && !selectedFile)}
                className="px-6 py-3 bg-primary text-on-primary font-headline font-black uppercase text-sm neo-border neo-shadow hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                Send
              </button>
            </div>
          </form>
        </div>

      </div>

      {/* Side-Canvas Workspace Drawer */}
      {canvasOpen && (
        <aside className="w-[450px] md:w-[500px] border-l-4 border-primary bg-background shrink-0 flex flex-col h-screen z-20 relative">
          
          {/* Tab Selector Headers */}
          <div className="flex-none flex border-b-4 border-primary bg-surface-variant">
            {[
              { id: 'explorer', label: 'Sandbox Files', icon: 'folder' },
              { id: 'preview', label: 'Editor Preview', icon: 'description' },
              { id: 'run', label: 'Terminal output', icon: 'terminal' },
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setCanvasTab(tab.id as any)}
                className={`flex-1 p-3 font-headline font-bold uppercase text-[10px] flex items-center justify-center gap-1.5 border-r-2 border-primary last:border-r-0 ${
                  canvasTab === tab.id 
                    ? 'bg-background text-primary border-b-4 border-b-transparent' 
                    : 'bg-surface-variant hover:bg-surface-container text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-xs">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Drawer Body content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 bg-surface-container-low flex flex-col">
            
            {/* Workspace Files Explorer */}
            {canvasTab === 'explorer' && (
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="flex justify-between items-center border-b-2 border-primary pb-2">
                  <h3 className="font-headline font-black uppercase text-xs text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">drafts</span>
                    Local Sandbox Directory
                  </h3>
                  <button 
                    onClick={handleCreateNewFile}
                    className="p-1 border border-primary bg-primary text-on-primary hover:bg-tertiary hover:text-on-tertiary transition-colors font-bold uppercase text-[8px]"
                  >
                    + New File
                  </button>
                </div>
                
                {wsFiles.length === 0 ? (
                  <p className="text-on-surface-variant text-[10px] italic text-center p-6 bg-background border border-dashed border-primary">
                    Workspace directory is currently empty. Ask Supr to write a script or file!
                  </p>
                ) : (
                  <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
                    {wsFiles.map((file) => (
                      <div 
                        key={file.filename}
                        className="p-2.5 border-2 border-primary bg-background hover:bg-primary-container hover:text-on-primary-container transition-colors flex items-center justify-between group"
                      >
                        <div 
                          onClick={() => handleOpenFile(file.filename)}
                          className="flex items-center gap-2.5 cursor-pointer overflow-hidden flex-1"
                        >
                          <span className="material-symbols-outlined text-primary text-sm">
                            {file.filename.endsWith('.py') ? 'terminal' : 'description'}
                          </span>
                          <div className="truncate">
                            <span className="font-headline font-bold text-xs uppercase block truncate">{file.filename}</span>
                            <span className="text-[8px] text-on-surface-variant block uppercase font-mono">
                              {(file.size / 1024).toFixed(2)} KB • {file.type}
                            </span>
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => handleDeleteFile(file.filename)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-error text-primary transition-all flex items-center"
                          title="Delete File"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Document / Code Editor Preview */}
            {canvasTab === 'preview' && (
              <div className="flex-1 flex flex-col space-y-4">
                {canvasFile ? (
                  <FileEditor 
                    filename={canvasFile.filename}
                    initialContent={canvasFile.content}
                    onSave={handleSaveFile}
                    onRun={handleRunFile}
                  />
                ) : (
                  <p className="text-on-surface-variant text-[10px] italic text-center p-6 bg-background border border-dashed border-primary">
                    Select a document from Sandbox Files to view or edit its contents.
                  </p>
                )}
              </div>
            )}

            {/* Simulated / Real Shell Execution Output */}
            {canvasTab === 'run' && (
              <div className="flex-1 flex flex-col space-y-4">
                <div className="border-b border-primary pb-1">
                  <span className="font-headline font-black uppercase text-xs text-primary">Terminal Execution Logs</span>
                </div>
                
                {runLoading ? (
                  <div className="p-6 bg-black text-amber-500 font-mono text-xs flex items-center gap-2 neo-border">
                    <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                    Executing script inside sandbox...
                  </div>
                ) : runOutput ? (
                  <div className="flex-1 bg-black text-white font-mono text-[11px] p-4 neo-border overflow-y-auto custom-scrollbar flex flex-col gap-3">
                    {runOutput.success ? (
                      <div className="text-green-500 font-bold uppercase text-[9px] flex items-center gap-1 border-b border-green-950 pb-1">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        Script Completed Successfully (Exit: 0)
                      </div>
                    ) : (
                      <div className="text-red-500 font-bold uppercase text-[9px] flex items-center gap-1 border-b border-red-950 pb-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        Script Failed (Error Returned)
                      </div>
                    )}
                    
                    {runOutput.stdout && (
                      <div>
                        <span className="text-gray-500 uppercase text-[8px] font-bold block mb-1">STDOUT:</span>
                        <pre className="whitespace-pre-wrap">{runOutput.stdout}</pre>
                      </div>
                    )}
                    
                    {runOutput.stderr && (
                      <div>
                        <span className="text-red-500 uppercase text-[8px] font-bold block mb-1">STDERR:</span>
                        <pre className="whitespace-pre-wrap text-red-400">{runOutput.stderr}</pre>
                      </div>
                    )}

                    {runOutput.error && (
                      <div>
                        <span className="text-red-500 uppercase text-[8px] font-bold block mb-1">EXCEPTION:</span>
                        <pre className="whitespace-pre-wrap text-red-400">{runOutput.error}</pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-on-surface-variant text-[10px] italic text-center p-6 bg-background border border-dashed border-primary">
                    Awaiting execution parameters. Select a script in the Editor and click &quot;Execute Code&quot;.
                  </p>
                )}
              </div>
            )}

          </div>

          <footer className="flex-none h-10 border-t-4 border-primary flex items-center px-4 justify-between bg-primary text-on-primary font-mono text-[10px]">
            <span>Workspace: ./supr_workspaces/</span>
            <span className="font-bold uppercase">Files: {wsFiles.length}</span>
          </footer>
        </aside>
      )}

    </div>
  );
}

interface FileEditorProps {
  filename: string;
  initialContent: string;
  onSave: (content: string) => void;
  onRun: () => void;
}

function FileEditor({ filename, initialContent, onSave, onRun }: FileEditorProps) {
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent, filename]);

  return (
    <div className="flex-1 flex flex-col space-y-3">
      <div className="flex justify-between items-center border-b border-primary pb-1">
        <span className="font-mono text-[10px] font-bold text-primary">{filename}</span>
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={() => onSave(content)}
            className="px-2 py-0.5 border border-primary bg-surface font-bold uppercase text-[9px] hover:bg-primary hover:text-on-primary transition-colors cursor-pointer"
          >
            Save Changes
          </button>
          <button 
            type="button"
            onClick={onRun}
            className="px-2 py-0.5 border border-primary bg-primary text-on-primary font-bold uppercase text-[9px] hover:bg-tertiary transition-colors cursor-pointer"
          >
            Execute Code
          </button>
        </div>
      </div>
      
      <textarea 
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1 bg-black text-green-400 font-mono text-[11px] leading-relaxed p-4 neo-border focus:outline-none custom-scrollbar resize-none"
      />
    </div>
  );
}

