import * as k8s from '@kubernetes/client-node';
import { exec } from 'child_process';
import { promisify } from 'util';

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

export { AbstractSandboxProvider, LocalNodeSandbox } from './local-node-sandbox';
