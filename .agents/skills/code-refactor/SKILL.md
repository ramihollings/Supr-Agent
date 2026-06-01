---
name: code-refactor
description: Rules and workflows for refactoring code and conducting thorough pull request reviews.
license: MIT
compatibility: >=1.0.0
metadata:
  category: Engineering
  tags: refactoring, review, clean-code
---

# Code Refactoring and Review Skill

This skill defines the workflow and standards for refactoring existing codebases and preparing pull request reviews.

## Core Rules
1. **Never Break Contracts**: Do not change public API surfaces or signatures unless explicitly asked.
2. **Ensure Test Coverage**: Run existing tests before refactoring, and add new test cases for any refactored paths.
3. **Dry/SRP Principle**: Consolidate repetitive code blocks into modular functions following the Single Responsibility Principle.
4. **Lint and Format**: Keep indentation, naming conventions, and file structures consistent with the project's standard config.

## Review Checklist
- Complexity: Are functions short and readable?
- Security: Are credentials protected? Any sql injection or path traversal vulnerabilities?
- Error Handling: Are edge cases handled with explicit try/catch blocks and informative error logs?
- Performance: Are queries optimized? Any unnecessary database calls or loops?
