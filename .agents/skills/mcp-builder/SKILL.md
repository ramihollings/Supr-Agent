---
name: mcp-builder
description: Guidance for designing and validating Model Context Protocol tools and servers.
license: MIT
compatibility: >=1.0.0
metadata:
  category: Integrations
  tags: mcp, tools, protocol
---

# MCP Builder Skill

Use this skill when adding MCP-compatible connectors or tool surfaces.

## Instructions
1. Define narrow tool schemas with explicit input validation and clear errors.
2. Keep credentials outside prompts and logs.
3. Return structured results that include status, evidence, and recoverable failure details.
4. Document transport, permissions, timeout behavior, and retry expectations.
