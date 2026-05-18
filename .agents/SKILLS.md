# Supr Skill Registry

This document outlines the engineering skills available to Supr and its subagents. Skills are small, composable, and inspectable procedures (inspired by Matt Pocock-style engineering patterns) that accelerate workflows.

## Core Engineering Skills

### 1. Toprank SEO Audits (`/toprank:*`)
- **Description**: Evaluates generated content and HTML structures for SEO best practices.
- **Usage**: Used primarily by the Research or QA agents during GrowthOps workflows.
- **Implementation**: Adapts open-source Toprank capabilities to analyze semantic HTML, meta tags, and keyword density.

### 2. CloakBrowser Wrappers
- **Description**: Provides safe, structured web scraping and interaction capabilities.
- **Usage**: Allows the Web Research agent to navigate complex DOMs, handle cookie banners, and extract structured JSON from unstructured pages.
- **Implementation**: A Puppeteer/Playwright abstraction wrapped behind the `SandboxProvider` for secure external access.

### 3. AST-Based Self-Healing Exceptions
- **Description**: Analyzes Abstract Syntax Trees (AST) of failed code to propose structural fixes rather than just regex replacements.
- **Usage**: Used by the Code Agent when encountering compile-time errors or syntax faults in the code workspace.
- **Implementation**: Parses code into AST, identifies missing imports, type mismatches, or malformed structures, and rewrites the problematic nodes automatically before retrying.

### 4. HTML-Anything Artifact Generation
- **Description**: Safely renders structured data, code summaries, or reports into interactive HTML previews.
- **Usage**: Invoked by the Planner or Demo agent to populate the Artifact Studio.
- **Implementation**: Utilizes a strict Content Security Policy iframe rendering pipeline to ensure safe preview of LLM-generated UI code.
