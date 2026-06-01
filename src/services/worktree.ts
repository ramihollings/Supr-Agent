import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const execAsync = promisify(exec);

export class WorktreeHelper {
  /**
   * Add a new git worktree at the specified path, branched from a base ref.
   */
  static async createWorktree(repoPath: string, path: string, branchName: string, baseRef: string = "main"): Promise<void> {
    const cleanRepoPath = repoPath.replace(/\\/g, "/");
    const cleanPath = path.replace(/\\/g, "/");

    console.log(`[WorktreeHelper] Creating git worktree at '${cleanPath}' from ref '${baseRef}' on branch '${branchName}'...`);
    
    // First ensure the directory does not exist (git worktree add will create it)
    if (fs.existsSync(cleanPath)) {
      fs.rmSync(cleanPath, { recursive: true, force: true });
    }

    try {
      // Run: git -C <repoPath> worktree add -b <branchName> <path> <baseRef>
      const cmd = `git -C "${cleanRepoPath}" worktree add -b "${branchName}" "${cleanPath}" "${baseRef}"`;
      await execAsync(cmd);
      console.log(`[WorktreeHelper] Git worktree successfully created.`);
    } catch (err: any) {
      console.error(`[WorktreeHelper] Failed to create git worktree:`, err);
      throw new Error(`Git worktree creation failed: ${err.message}`);
    }
  }

  /**
   * Remove a git worktree.
   */
  static async removeWorktree(repoPath: string, path: string): Promise<void> {
    const cleanRepoPath = repoPath.replace(/\\/g, "/");
    const cleanPath = path.replace(/\\/g, "/");

    console.log(`[WorktreeHelper] Removing git worktree at '${cleanPath}'...`);

    try {
      // Run: git -C <repoPath> worktree remove --force <path>
      const cmd = `git -C "${cleanRepoPath}" worktree remove --force "${cleanPath}"`;
      await execAsync(cmd);
      console.log(`[WorktreeHelper] Git worktree successfully removed.`);
    } catch (err: any) {
      console.error(`[WorktreeHelper] Failed to remove git worktree:`, err);
      // Fallback clean local delete if git remove fails
      if (fs.existsSync(cleanPath)) {
        fs.rmSync(cleanPath, { recursive: true, force: true });
      }
    }
  }

  /**
   * List git worktrees for a repo.
   */
  static async listWorktrees(repoPath: string): Promise<string[]> {
    const cleanRepoPath = repoPath.replace(/\\/g, "/");
    try {
      const { stdout } = await execAsync(`git -C "${cleanRepoPath}" worktree list`);
      return stdout.split("\n").filter(Boolean);
    } catch (err: any) {
      console.error(`[WorktreeHelper] Failed to list worktrees:`, err);
      return [];
    }
  }
}
