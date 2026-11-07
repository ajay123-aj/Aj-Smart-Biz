# Aj Smart Biz — Documentation

Business and technical documentation for the whole platform, generated from the code on 7 November 2026.

PDFs are in [`pdf/`](pdf/). Their HTML sources are in [`source/`](source/).

| # | Document | Audience |
|---|---|---|
| 01 | [Executive Summary & Business Overview](pdf/01-Executive-Summary.pdf) | Founders, stakeholders, sales |
| 02 | [Business Requirements Document (BRD)](pdf/02-Business-Requirements-Document.pdf) | Product, business analysts, QA |
| 03 | [Functional Specification (FRS)](pdf/03-Functional-Specification.pdf) | Product, QA, support, developers |
| 04 | [System Architecture & Design](pdf/04-System-Architecture-Design.pdf) | Architects, developers, DevOps |
| 05 | [Database Design](pdf/05-Database-Design.pdf) | Developers, DBAs, analysts |
| 06 | [API Reference](pdf/06-API-Reference.pdf) | Front-end and integration developers |
| 07 | [Deployment, DevOps & Runbook](pdf/07-Deployment-DevOps.pdf) | DevOps, on-call |
| 08 | [Security & Data Protection](pdf/08-Security-Compliance.pdf) | Tech leads, reviewers |
| 09 | [User Manual](pdf/09-User-Manual.pdf) | Super admins, company admins, staff |
| 10 | [Developer Guide & Coding Standards](pdf/10-Developer-Guide-Coding-Standards.pdf) | Developers, AI coding agents |
| 11 | [QA, Known Issues & Roadmap](pdf/11-QA-Known-Issues-Roadmap.pdf) | Product owner, QA, tech lead |
| 12 | [New Client Onboarding BRD](pdf/12-Client-Onboarding-BRD.pdf), with the process and a fill-in requirements template | Sales, onboarding team, client |

## Rebuilding the PDFs

```bash
node docs/build-pdf.js        # all documents
node docs/build-pdf.js 04     # only files whose name contains "04"
```

The build needs Chrome or Edge, and no npm packages. If the browser is not in a standard location, set `CHROME_PATH`. Every document shares the stylesheet `source/assets/doc.css`.

## AI skill

[`.claude/skills/aj-smart-biz-feature/`](../.claude/skills/aj-smart-biz-feature/SKILL.md) holds the same conventions as Document 10, packaged for Claude Code. Claude loads it whenever it adds functionality to this repository. It covers:

- the folder structure
- the code format and naming rules
- the end-to-end file checklist for the backend, both consoles and all three themes

## Keeping docs current

When you change behaviour:

1. Update the matching `source/*.html`.
2. Re-run the build.

Document 11 lists the places where the in-code READMEs have already drifted from the code.
