---
name: docx
description: Workflows for reading, editing, validating, and summarizing Word-compatible DOCX documents.
license: MIT
compatibility: >=1.0.0
metadata:
  category: Documents
  tags: docx, word, document
---

# DOCX Skill

Use this skill when an agent needs to inspect or produce Word-compatible documents.

## Instructions
1. Preserve document structure before changing wording or formatting.
2. Track requested edits by section and explain any assumptions.
3. Validate that generated content is readable as plain text and as a document artifact.
4. When extracting content, report headings, tables, comments, and unresolved placeholders separately.
