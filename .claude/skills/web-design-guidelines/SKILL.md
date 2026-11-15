---
name: web-design-guidelines
description: Review ULYSSE interface code (frontend/src) against the Web Interface Guidelines (accessibility, focus, forms, animation, typography, content handling, performance, i18n, anti-patterns). Use when asked to review the UI, check accessibility, audit design or check the interface against best practices. NOT for prose or documentation review (use writing-guidelines).
---

# Web Interface Guidelines (local, pinned copy)

ULYSSE wrapper written for this project. The rules come from Vercel Labs' Web Interface Guidelines
(MIT, `vercel-labs/web-interface-guidelines` at commit `434b7f91364665f2f733b310ec54809bf8f37937`),
stored next to this file in `guidelines.md`. Unlike the upstream skill, it never fetches rules from the
network at run time: the reviewed rule set is the one that was read and pinned.

## How to use

1. Read `guidelines.md` in this folder (rules and output format).
2. Read the files to review (default: `frontend/src/**/*.tsx` and `frontend/src/**/*.css`).
3. Report findings in `file:line` format, grouped by file.

## Project adaptations (they win over the upstream rules)

- French (Canada) interface: sentence case for headings and buttons (French typography), not Title Case.
- Numbers and dates: always through `Intl.NumberFormat('fr-CA')` / `Intl.DateTimeFormat('fr-CA')`.
- Signals are never conveyed by color alone: icon + text (✅ ⚠ ⛔ with a word).
- Never wording that recommends (« achète », « vends », « tu devrais ») or creates urgency.
