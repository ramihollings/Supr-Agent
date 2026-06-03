"use client";

export interface WorkspaceFileSummary {
  filename: string;
  size: number;
  type: string;
}

interface WorkspaceFilesPanelProps {
  files: WorkspaceFileSummary[];
  onCreateNewFile: () => void;
  onOpenFile: (filename: string) => void;
  onDeleteFile: (filename: string) => void;
}

export function WorkspaceFilesPanel({
  files,
  onCreateNewFile,
  onOpenFile,
  onDeleteFile,
}: WorkspaceFilesPanelProps) {
  return (
    <div className="space-y-4 flex-1 flex flex-col">
      <div className="flex justify-between items-center border-b-2 border-primary pb-2">
        <h3 className="font-headline font-black uppercase text-xs text-primary flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">drafts</span>
          Local Sandbox Directory
        </h3>
        <button
          onClick={onCreateNewFile}
          className="p-1 border border-primary bg-primary text-on-primary hover:bg-tertiary hover:text-on-tertiary transition-colors font-bold uppercase text-[8px]"
        >
          + New File
        </button>
      </div>

      {files.length === 0 ? (
        <p className="text-on-surface-variant text-[10px] italic text-center p-6 bg-background border border-dashed border-primary">
          Workspace directory is currently empty. Ask Supr to write a script or file!
        </p>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
          {files.map((file) => (
            <div
              key={file.filename}
              className="p-2.5 border-2 border-primary bg-background hover:bg-primary-container hover:text-on-primary-container transition-colors flex items-center justify-between group text-on-surface"
            >
              <div
                onClick={() => onOpenFile(file.filename)}
                className="flex items-center gap-2.5 cursor-pointer overflow-hidden flex-1"
              >
                <span className="material-symbols-outlined text-primary text-sm">
                  {file.filename.endsWith(".py") ? "terminal" : "description"}
                </span>
                <div className="truncate">
                  <span className="font-headline font-bold text-xs uppercase block truncate">{file.filename}</span>
                  <span className="text-[8px] text-on-surface-variant block uppercase font-mono">
                    {(file.size / 1024).toFixed(2)} KB • {file.type}
                  </span>
                </div>
              </div>

              <button
                onClick={() => onDeleteFile(file.filename)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-error text-primary transition-all flex items-center"
                title="Delete File"
                aria-label={`Delete ${file.filename}`}
              >
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
