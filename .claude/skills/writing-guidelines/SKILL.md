---
name: writing-guidelines
description: Review ULYSSE interface copy and documentation (frontend/src/i18n, docs/*.md) for clear, neutral, factual writing (active voice, no filler or marketing words, concrete figures, no rhetorical questions, consistent typography). Use when asked to review UI text, docs voice and tone or prose quality. NOT for code-level UI review (use web-design-guidelines).
---

# Writing Guidelines (local, pinned copy)

ULYSSE wrapper written for this project. The rules come from Vercel Labs' Writing Guidelines
(MIT, `vercel-labs/writing-guidelines` at commit `83e2316b034cf572400513538e4e4da01c4cc742`), stored in
`guidelines.md`. No network access at run time.

## How to use

1. Read `guidelines.md` in this folder.
2. Apply the sections that concern prose: voice and tone, banned words, concision, AI-generated tells,
   headings, structure, lists, emphasis, punctuation and typography, links.
3. Skip the Vercel-specific sections (meta fields, dashboard links, model strings, AI workflow, PR review,
   Steps component): they do not apply to this project.
4. Report findings in `file:line` format.

## Project adaptations (they win over the upstream rules)

- Language is French (Canada), « tu » form in the app; French equivalents of banned words also apply
  (« facile », « simple », « rapide », « juste », « vraiment », « très »).
- Financial copy must stay neutral: « selon tes règles », « les données montrent », « ce qui changerait le
  constat » ; never « achète », « vends », « tu devrais », « bonne affaire », « occasion à ne pas manquer ».
- Every figure carries its unit, period and comparison (e.g. « soit 4,2 % de ton portefeuille »).
