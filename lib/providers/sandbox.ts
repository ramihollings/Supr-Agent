import * as k8s from '@kubernetes/client-node';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  duration: number;
}

/**
 * Ephemeral Kubernetes Sandbox Provider
 * Spawns an isolated pod under gVisor, runs code, extracts logs, and deletes the pod.
 */
export class SandboxProvider {
  private k8sApi: k8s.CoreV1Api;
  private namespace: string;
  private gcsBucketName: string;

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.namespace = 'supr-sandbox-workers';
    this.gcsBucketName = process.env.GCS_BUCKET_NAME || 'supr-state-bucket';
  }

  async executeCode(language: string, code: string, workspaceId: string): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    const podName = `supr-worker-${Math.random().toString(36).substring(2, 7)}`;

    let containerCmd: string[] = [];
    let containerArgs: string[] = [];

    if (language.toLowerCase() === 'python' || language.toLowerCase() === 'py') {
      containerCmd = ['python3', '-c'];
      containerArgs = [code];
    } else if (language.toLowerCase() === 'javascript' || language.toLowerCase() === 'js' || language.toLowerCase() === 'node') {
      containerCmd = ['node', '-e'];
      containerArgs = [code];
    } else {
      throw new Error(`Unsupported execution language environment: ${language}`);
    }

    const podManifest: k8s.V1Pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: podName,
        namespace: this.namespace,
        labels: {
          tier: 'sandbox-worker',
          workspace: workspaceId
        }
      },
      spec: {
        runtimeClassName: 'gvisor',
        automountServiceAccountToken: false,
        restartPolicy: 'Never',
        containers: [
          {
            name: 'sandbox-executor',
            image: `us-central1-docker.pkg.dev/${process.env.GCP_PROJECT_ID || 'supr-project'}/supr-repo/supr-agent:latest`,
            command: containerCmd,
            args: containerArgs,
            securityContext: {
              allowPrivilegeEscalation: false,
              readOnlyRootFilesystem: false,
              runAsNonRoot: true,
              runAsUser: 1001,
              runAsGroup: 1001,
              capabilities: {
                drop: ['ALL']
              }
            },
            resources: {
              limits: {
                cpu: '1',
                memory: '1Gi'
              },
              requests: {
                cpu: '250m',
                memory: '256Mi'
              }
            },
            volumeMounts: [
              {
                name: 'supr-gcs-fuse',
                mountPath: '/app/supr_workspaces'
              }
            ]
          }
        ],
        volumes: [
          {
            name: 'supr-gcs-fuse',
            csi: {
              driver: 'gcsfuse.csi.storage.gke.io',
              volumeAttributes: {
                bucketName: this.gcsBucketName,
                mountOptions: 'implicit-dirs,temp-dir=/tmp'
              }
            }
          }
        ]
      }
    };

    console.log(`[Sandbox] Deploying ephemeral pod ${podName} in namespace ${this.namespace}...`);
    await this.k8sApi.createNamespacedPod({ namespace: this.namespace, body: podManifest });

    let podSucceeded = false;
    let podErrorMsg = '';

    try {
      const timeoutMs = 60000;
      const pollIntervalMs = 1500;
      const limit = Date.now() + timeoutMs;

      while (Date.now() < limit) {
        const statusRes = await this.k8sApi.readNamespacedPodStatus({ name: podName, namespace: this.namespace });
        const phase = statusRes.status?.phase;

        if (phase === 'Succeeded') {
          podSucceeded = true;
          break;
        } else if (phase === 'Failed') {
          podSucceeded = false;
          podErrorMsg = 'Pod execution failed (non-zero exit code).';
          break;
        } else if (phase === 'Unknown') {
          throw new Error('Pod entered an Unknown phase state.');
        }

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }

      if (Date.now() >= limit) {
        throw new Error('Sandbox execution exceeded the 60-second GKE runtime limit.');
      }

      console.log(`[Sandbox] Execution completed. Fetching logs from ${podName}...`);
      const logOutput = await this.k8sApi.readNamespacedPodLog({ name: podName, namespace: this.namespace });
      const duration = Date.now() - startTime;

      return {
        stdout: podSucceeded ? logOutput : '',
        stderr: podSucceeded ? '' : (logOutput || podErrorMsg),
        duration
      };

    } finally {
      console.log(`[Sandbox] Cleaning up and deleting ephemeral pod ${podName}...`);
      try {
        await this.k8sApi.deleteNamespacedPod({ name: podName, namespace: this.namespace });
      } catch (cleanupErr: any) {
        console.error(`[Sandbox] Warnings encountered during pod cleanup: ${cleanupErr.message}`);
      }
    }
  }
}

// Backward compatibility provider for local/standalone execution
export abstract class AbstractSandboxProvider {
  abstract createSession(workspaceId: string): Promise<string>;
  abstract executeCommand(sessionId: string, command: string): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number; error?: string }>;
  abstract readArtifact(sessionId: string, path: string): Promise<string>;
  abstract writeArtifact(sessionId: string, path: string, content: string): Promise<void>;
  abstract destroySession(sessionId: string): Promise<void>;
}

export class LocalNodeSandbox extends AbstractSandboxProvider {
  private baseSandboxDir: string;

  constructor() {
    super();
    this.baseSandboxDir = path.resolve(process.cwd(), 'supr_workspaces');
    if (!fs.existsSync(this.baseSandboxDir)) {
      fs.mkdirSync(this.baseSandboxDir, { recursive: true });
    }
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.baseSandboxDir, sessionId);
  }

  private resolveAndValidatePath(sessionId: string, targetPath: string): string {
    const sessionDir = this.getSessionPath(sessionId);
    const absoluteTargetPath = path.resolve(sessionDir, targetPath);
    if (!absoluteTargetPath.startsWith(sessionDir)) {
      throw new Error(`Security Exception: Path traversal attempt detected. Access denied to ${targetPath}`);
    }
    return absoluteTargetPath;
  }

  async createSession(workspaceId: string): Promise<string> {
    const sessionId = `sbx-${workspaceId}-${Date.now()}`;
    const sessionDir = this.getSessionPath(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionId;
  }

  async executeCommand(sessionId: string, command: string) {
    const sessionDir = this.getSessionPath(sessionId);
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session ${sessionId} does not exist.`);
    }

    const absoluteSessionDir = path.resolve(sessionDir);
    let hostPath = absoluteSessionDir.replace(/\\/g, '/');

    if (process.env.HOST_WORKSPACE_PATH) {
      const containerBase = path.resolve(process.env.CONTAINER_WORKSPACE_PATH || '/app/supr_workspaces').replace(/\\/g, '/');
      const resolvedSessionDir = absoluteSessionDir.replace(/\\/g, '/');
      if (resolvedSessionDir.startsWith(containerBase)) {
        const relativePart = resolvedSessionDir.slice(containerBase.length);
        const hostBase = process.env.HOST_WORKSPACE_PATH.replace(/\\/g, '/');
        hostPath = hostBase + relativePart;
        console.log(`[DockerSandbox] Remapped container path ${resolvedSessionDir} to host path ${hostPath}`);
      }
    }

    // 1. Resolve settings for API key exposure using the lazy DB getter
    let envFlags = '';
    try {
      const { getSqliteDb } = require('../database/init');
      const db = getSqliteDb();
      const settingRow = db.prepare("SELECT value FROM Settings WHERE key = 'sandbox_allow_api_keys'").get() as { value: string } | undefined;
      const allowKeys = settingRow?.value === 'true';

      if (allowKeys) {
        if (process.env.GEMINI_API_KEY) {
          envFlags += ` -e GEMINI_API_KEY="${process.env.GEMINI_API_KEY}"`;
        }
        if (process.env.MINIMAX_API_KEY) {
          envFlags += ` -e MINIMAX_API_KEY="${process.env.MINIMAX_API_KEY}"`;
        }
      }
    } catch (dbErr) {
      console.warn('[DockerSandbox] Failed to query Settings DB for sandbox_allow_api_keys:', dbErr);
    }

    // 2. Select image based on command
    let image = 'python:3.10-alpine'; // default fallback
    const lowerCmd = command.toLowerCase();
    if (lowerCmd.includes('node') || lowerCmd.includes('npm')) {
      image = 'node:18-alpine';
    } else if (lowerCmd.includes('python') || lowerCmd.includes('pip') || lowerCmd.includes('pytest')) {
      image = 'python:3.10-alpine';
    } else {
      image = 'alpine:latest';
    }

    // 3. Translate absolute host paths in command to container-relative paths
    let containerCommand = command
      .replace(new RegExp(absoluteSessionDir.replace(/\\/g, '\\\\'), 'g'), '.')
      .replace(new RegExp(hostPath, 'g'), '.');

    // Convert backslashes to forward slashes for the Linux container execution environment
    containerCommand = containerCommand.replace(/\\/g, '/');

    // Assemble the docker command.
    // Wrap the container command inside double quotes for sh -c
    const dockerCmd = `docker run --rm -v "${hostPath}:/workspace" -w /workspace${envFlags} ${image} sh -c ${JSON.stringify(containerCommand)}`;

    const startTime = Date.now();
    try {
      const { stdout, stderr } = await execAsync(dockerCmd);
      return {
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0,
        durationMs: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
        durationMs: Date.now() - startTime,
        error: error.message
      };
    }
  }

  async readArtifact(sessionId: string, targetPath: string): Promise<string> {
    const safePath = this.resolveAndValidatePath(sessionId, targetPath);
    if (!fs.existsSync(safePath)) {
      throw new Error(`Artifact not found: ${targetPath}`);
    }
    return fs.readFileSync(safePath, 'utf-8');
  }

  async writeArtifact(sessionId: string, targetPath: string, content: string): Promise<void> {
    const safePath = this.resolveAndValidatePath(sessionId, targetPath);
    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(safePath, content, 'utf-8');
  }

  async destroySession(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionPath(sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }
}
