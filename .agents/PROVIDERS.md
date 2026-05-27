# Supr Provider Interfaces

This document outlines the core unified abstract classes that form the Supr abstraction layer. These interfaces ensure the system logic remains decoupled from any specific underlying infrastructure.

## 1. `ModelProvider`
Handles interactions with LLMs and multi-model routing.
- **Responsibilities**: Prompt routing, token counting, cost tracking, streaming responses, and managing context limits.
- **Implementations**: Gemini, Vertex AI, LiteLLM, OpenAI, OpenRouter.

## 2. `RuntimeProvider`
Manages the orchestration of agent lifecycles and background workers.
- **Responsibilities**: Spawning agents, handling event queues, and scheduling tasks.
- **Implementations**: Google Agent Platform Runtime, Cloud Run, Docker Compose, k3s, iii (local engine).

## 3. `MemoryProvider`
Provides persistent and semantic storage for agent context.
- **Responsibilities**: Saving and retrieving `Memory_Items` using hybrid search (BM25 + vector embeddings).
- **Implementations**: Google Agent Memory Bank, agentmemory, Postgres/pgvector.

## 4. `SandboxProvider`
Executes untrusted or generated code in an isolated environment.
- **Responsibilities**: Running scripts, capturing stdout/stderr/exit codes, managing dependencies, and enforcing resource limits.
- **Implementations**: GKE Agent Sandbox, Docker, gVisor, Firecracker.

## 5. `TraceProvider`
Provides observability, logging, and event tracking.
- **Responsibilities**: Emitting mission events, recording latencies, tracing tool execution, and tracking drift scores.
- **Implementations**: Cloud Trace/Logging, OpenTelemetry, Langfuse.
