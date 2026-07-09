# TODO

The backlog moved to a single place. There is no separate to-do list anymore.

- **Work backlog (epics, tickets, sequencing)** → [scrum.md](./scrum.md)
- **Design standard the backlog serves** → [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Definition of done for promoting a tool** → [CLAUDE.md](./CLAUDE.md) (Implementation status section)
- **SEO strategy / reference material** → [seo-audit-output/](./seo-audit-output/)

The hard constraint on every task, unchanged: **no file bytes ever leave the device** - no
`fetch`/`XHR` of PDF contents, no third-party API. `PdfMergeTool.jsx` + `src/lib/merge.js` remain the
reference implementation for a finished tool.
