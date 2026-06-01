---
name: pdf
description: Guidelines for extracting, parsing, and summarizing PDF document contents.
license: MIT
compatibility: >=1.0.0
metadata:
  category: Utilities
  tags: pdf, parser, extractor
---

# PDF Processor Skill

This skill provides guidelines and procedures for extracting, parsing, and summarizing text and structured data from PDF files.

## Instructions
1. Inspect the layout of the PDF using python libraries (e.g. `pypdf`, `pdfplumber`).
2. Identify major sections (table of contents, headers, footers, body text).
3. Extract text content, ensuring that multi-column layouts are parsed in the correct reading order.
4. Extract tables and convert them to Markdown tables for readability.
5. Compile a structured summary containing:
   - Document metadata (Title, Authors, Date)
   - Executive Summary
   - Section-by-section breakdown
   - Critical data points or tables
