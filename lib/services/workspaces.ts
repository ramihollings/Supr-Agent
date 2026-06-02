import path from "node:path";
import fs from "node:fs";
import { WorktreeHelper } from "./worktree";

export class WorkspaceManager {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), "supr_workspaces");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Creates an isolated workspace for a specific agent execution session.
   * If a git repo is provided, uses worktree branch isolation.
   */
  async createIsolatedWorkspace(missionId: string, agentId: string, repoPath?: string): Promise<string> {
    const sessionKey = `${missionId}-${agentId}-${Date.now()}`;
    const workspacePath = path.join(this.baseDir, sessionKey);

    if (repoPath && fs.existsSync(path.join(repoPath, ".git"))) {
      // Git-backed project — initialize worktree branch
      const branchName = `run-${missionId}-${Date.now()}`;
      await WorktreeHelper.createWorktree(repoPath, workspacePath, branchName, "main");
    } else {
      // Normal filesystem directory copy / creation
      fs.mkdirSync(workspacePath, { recursive: true });
      console.log(`[WorkspaceManager] Created isolated directory at: ${workspacePath}`);
    }

    return workspacePath;
  }

  /**
   * Cleans up and removes an isolated workspace directory.
   */
  async cleanupWorkspace(workspacePath: string, repoPath?: string): Promise<void> {
    if (!fs.existsSync(workspacePath)) return;

    if (repoPath && fs.existsSync(path.join(repoPath, ".git"))) {
      // Remove git worktree
      await WorktreeHelper.removeWorktree(repoPath, workspacePath);
    } else {
      // Delete local directory
      console.log(`[WorkspaceManager] Removing directory: ${workspacePath}`);
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  }
}

export const workspaceManager = new WorkspaceManager();
export default workspaceManager;
