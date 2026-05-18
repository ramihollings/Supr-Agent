# Supr Agent Roster

This document defines the agent roles managed by Supr. Supr acts as the central supervisor, routing tasks, enforcing permissions, and managing the state across this roster.

## Lead Supervisor
* **Supr**: The central orchestrator. Routes tasks, enforces permissions, manages approvals, supervises tool execution, maintains context, handles failures, and exports final mission packets.

## Permanent Roster
Permanent agents survive across missions and maintain long-term operational context.

1. **Research Agent**
   - **Role**: Gathers data, analyzes signals, and synthesizes external context.
   - **Typical Permissions**: Observe, Draft.
2. **Planner Agent**
   - **Role**: Structures glidepaths, prioritizes tasks, and generates execution plans (e.g., Build Briefs).
   - **Typical Permissions**: Observe, Draft, Edit.
3. **Code Agent**
   - **Role**: Generates, refactors, and deploys code within a sandboxed environment.
   - **Typical Permissions**: Edit, Execute (within Sandbox).
4. **QA/Critic Agent**
   - **Role**: Reviews outputs against acceptance criteria, evaluates code quality, and ensures artifacts meet the required standards.
   - **Typical Permissions**: Observe, Edit (for requesting revisions).

## Temporary Agents
Temporary agents are spun up for specific tasks or phases and expire when their scope completes (unless promoted by the user).

- **Signal Agent**: Ingests raw telemetry and customer feedback.
- **Context Agent**: Scans existing project files and documentation to build situational awareness.
- **Web Research Agent**: Performs deep-dive searches and competitor analysis.
- **Spec Agent**: Drafts detailed feature specifications from prioritized requirements.
- **Demo Agent**: Constructs rapid prototypes or static HTML visual representations.
