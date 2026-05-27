# Supr Architecture: Provider Abstraction Mapping

This document details the provider abstraction mappings for Supr v3.5, ensuring the system remains Google-native but VPS-portable. The architecture is designed to run anywhere, using abstract providers to interface with specific technologies based on the deployment profile.

## Deployment Profiles

### 1. Google-Native (Production Backbone)
The preferred production path utilizing Google Cloud and Google ADK.
- **Model**: Gemini / Vertex AI / Model Garden
- **Agent Runtime**: Agent Platform Runtime, Cloud Run, GKE
- **Memory**: Agent Memory Bank, Firestore, AlloyDB, Vertex AI Search
- **Sandbox**: GKE Agent Sandbox, GKE Sandbox, Cloud Run Jobs
- **Tracing**: Cloud Trace, Cloud Logging, Cloud Monitoring
- **Queue**: Pub/Sub, Cloud Tasks, Eventarc
- **Secrets**: Secret Manager, IAM, Workload Identity Federation
- **Artifacts**: Cloud Storage, BigQuery

### 2. VPS-Portable (Local / Self-Host)
A resilient, independent deployment using local or self-hosted services (e.g., Node/Python/k3s/iii-engine on port 49134).
- **Model**: LiteLLM, OpenRouter, Ollama, vLLM
- **Agent Runtime**: Docker Compose, k3s, local workers, iii (on port 49134)
- **Memory**: agentmemory, Postgres/pgvector, Qdrant, LanceDB
- **Sandbox**: Docker, gVisor, Firecracker, restricted local runner
- **Tracing**: OpenTelemetry, Langfuse, Loki, Grafana
- **Queue**: Redis Streams, NATS, RabbitMQ, Temporal
- **Secrets**: Vault, Infisical, Doppler, encrypted env store
- **Artifacts**: MinIO, local volume, S3-compatible storage

## The Supr Abstraction Core
Supr Core communicates exclusively through the following unified interfaces, preventing vendor lock-in:
- `ModelProvider`
- `RuntimeProvider`
- `MemoryProvider`
- `SandboxProvider`
- `TraceProvider`
- `EventProvider`
- `SecretProvider`
- `ArtifactProvider`
