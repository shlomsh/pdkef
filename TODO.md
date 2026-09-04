<!-- GENERATED COMPATIBILITY INDEX: edit backlog/tasks/*.md, then run node scripts/generate-backlog.mjs -->

# TODO

> The former monolithic TODO is now a generated index. The only editable task records are in [backlog/tasks/](backlog/tasks/).

## Open work

See [BACKLOG.md](BACKLOG.md) for the generated status view.

## Sign Tool architecture review (2026-08-28)

| ID | Priority | Task |
| --- | --- | --- |
| SIGN-01 | P1 | [SIGN-01](backlog/tasks/SIGN-01.md) · Recover after export failure |
| SIGN-02 | P2 | [SIGN-02](backlog/tasks/SIGN-02.md) · Repair selection/editing invariants |
| SIGN-03 | P2 | [SIGN-03](backlog/tasks/SIGN-03.md) · Retry failed live font loads |
| SIGN-04 | P1 | [SIGN-04](backlog/tasks/SIGN-04.md) · Preserve Unicode content and whitespace |
| SIGN-05 | P1 | [SIGN-05](backlog/tasks/SIGN-05.md) · One page-coordinate transform |
| SIGN-06 | P1 | [SIGN-06](backlog/tasks/SIGN-06.md) · Report actual draft-save state |
| SIGN-07 | P1 | [SIGN-07](backlog/tasks/SIGN-07.md) · Make the offline requirement testable |
| SIGN-08 | P1 | [SIGN-08](backlog/tasks/SIGN-08.md) · Share the effective typography descriptor |
| SIGN-09 | P1 | [SIGN-09](backlog/tasks/SIGN-09.md) · Direction defaults and native IME input |
| SIGN-10 | P2 | [SIGN-10](backlog/tasks/SIGN-10.md) · A language/font source of truth and acceptance matrix |
| SIGN-11 | P2 | [SIGN-11](backlog/tasks/SIGN-11.md) · Versioned, validated shared persistence |
| SIGN-12 | P2 | [SIGN-12](backlog/tasks/SIGN-12.md) · Make required undo dependable |
| SIGN-13 | P2 | [SIGN-13](backlog/tasks/SIGN-13.md) · Anonymous usage and error maintenance signals |
| SIGN-14 | P2 | [SIGN-14](backlog/tasks/SIGN-14.md) · Separate editor core, UI, and export adapters incrementally |
| SIGN-15 | P2 | [SIGN-15](backlog/tasks/SIGN-15.md) · Bound document/render/gesture lifecycles |
| SIGN-16 | P2 | [SIGN-16](backlog/tasks/SIGN-16.md) · Trustworthy delivery checks and docs |
| SIGN-17 | P1 | [SIGN-17](backlog/tasks/SIGN-17.md) · Fix CI-red tests from in-flight SIGN-04/SIGN-09 direction work |
| SIGN-18 | P1 | [SIGN-18](backlog/tasks/SIGN-18.md) · The Sign toolbar's per-row cap stopped matching when the Feedback control made it ten |
| SIGN-19 | P1 | [SIGN-19](backlog/tasks/SIGN-19.md) · Four shaping/render guards passed on macOS and failed on Linux CI |
| SIGN-20 | P3 | [SIGN-20](backlog/tasks/SIGN-20.md) · The per-script pixel guards are close to blind to a cluster whose ink is right and whose advance is wrong |
| SIGN-21 | P1 | [SIGN-21](backlog/tasks/SIGN-21.md) · Make the browser guard helpers reachable from the preview server |
| SIGN-22 | P1 | [SIGN-22](backlog/tasks/SIGN-22.md) · Restore the CSS release gate after adding language-request actions |
| SIGN-23 | P1 | [SIGN-23](backlog/tasks/SIGN-23.md) · Make non-default language fonts explicitly offline-ready |
| SIGN-24 | P1 | [SIGN-24](backlog/tasks/SIGN-24.md) · Separate saved-signature assets from scalar preferences |
| SIGN-25 | P1 | [SIGN-25](backlog/tasks/SIGN-25.md) · Reconcile and enforce shipped dependency licenses |
| SIGN-26 | P2 | [SIGN-26](backlog/tasks/SIGN-26.md) · Establish dependency vulnerability and update governance |


## Editor module boundaries (architecture)

| ID | Priority | Task |
| --- | --- | --- |
| ARCH-01 | P2 | [ARCH-01](backlog/tasks/ARCH-01.md) · Move editor/model out of lib/ |
| ARCH-02 | P2 | [ARCH-02](backlog/tasks/ARCH-02.md) · Relocate the shared page-coordinate transform into editor/geometry |
| ARCH-03 | P2 | [ARCH-03](backlog/tasks/ARCH-03.md) · Give text policy its own home, and stop composing English sentences inside it |
| ARCH-04 | P2 | [ARCH-04](backlog/tasks/ARCH-04.md) · Split PDF-library adapters out of workspace/ and lib/ |
| ARCH-05 | P3 | [ARCH-05](backlog/tasks/ARCH-05.md) · Move draft persistence into workspace/ |
| ARCH-06 | P3 | [ARCH-06](backlog/tasks/ARCH-06.md) · Route Sign/Redact's own preference storage through workspace instead of raw localStorage |
| ARCH-07 | P3 | [ARCH-07](backlog/tasks/ARCH-07.md) · Consolidate documentation locale routing under src/i18n/ |
| ARCH-08 | P2 | [ARCH-08](backlog/tasks/ARCH-08.md) · Make documentation shell messages data-driven per locale |
| ARCH-09 | P2 | [ARCH-09](backlog/tasks/ARCH-09.md) · Make translated documentation freshness enforceable |
| ARCH-10 | P2 | [ARCH-10](backlog/tasks/ARCH-10.md) · Replace permissive editor-shell types with shared contracts |
| ARCH-11 | P2 | [ARCH-11](backlog/tasks/ARCH-11.md) · Enforce editor dependency directions in CI |
| ARCH-12 | P2 | [ARCH-12](backlog/tasks/ARCH-12.md) · Validate canonical backlog and generated indexes in CI |
| ARCH-13 | P2 | [ARCH-13](backlog/tasks/ARCH-13.md) · Restore CSS delivery-budget headroom |
| ARCH-14 | P2 | [ARCH-14](backlog/tasks/ARCH-14.md) · Type the editor interaction tests now covered by shared contracts |


## Internationalization: fonts for scripts beyond Hebrew/Latin

| ID | Priority | Task |
| --- | --- | --- |
| FONT-01 | P1 | [FONT-01](backlog/tasks/FONT-01.md) · Recalibrate the export-render guard's cross-platform tolerance |
| FONT-02 | P2 | [FONT-02](backlog/tasks/FONT-02.md) · One font manifest |
| FONT-03 | P2 | [FONT-03](backlog/tasks/FONT-03.md) · Malayalam |
| FONT-04 | P3 | [FONT-04](backlog/tasks/FONT-04.md) · Gujarati (~62M), Kannada (~44M), Odia |
| FONT-05 | P2 | [FONT-05](backlog/tasks/FONT-05.md) · Export-render-guard corpus cases for Simplified Chinese, Traditional Chinese and Korean |
| FONT-06 | P3 | [FONT-06](backlog/tasks/FONT-06.md) · Urdu in Nastaliq |
| FONT-07 | P3 | [FONT-07](backlog/tasks/FONT-07.md) · Emoji |
| FONT-08 | P3 | [FONT-08](backlog/tasks/FONT-08.md) · Second-font / missing-style research across every single-font script |


## Migrated context and history

The prose, decisions, and supporting evidence formerly interleaved with tickets live in [backlog/reference/migrated-todo-context.md](backlog/reference/migrated-todo-context.md). It is reference material, not a task tracker.

### Launch / SEO

See [migrated context](backlog/reference/migrated-todo-context.md#launch-seo).

### Editor / UX

See [migrated context](backlog/reference/migrated-todo-context.md#editor-ux).

### Hebrew text export: the three missing pipeline layers ~~(all five layers now exist)~~

See [migrated context](backlog/reference/migrated-todo-context.md#hebrew-text-export-the-three-missing-pipeline-layers-all-five-layers-now-exist).

### WYSIWYG text: what the two engines actually guarantee

See [migrated context](backlog/reference/migrated-todo-context.md#wysiwyg-text-what-the-two-engines-actually-guarantee).

### Known small defects

See [migrated context](backlog/reference/migrated-todo-context.md#known-small-defects).

### Migration status: structurally complete

See [migrated context](backlog/reference/migrated-todo-context.md#migration-status-structurally-complete).

### Landed structural wins: do not reopen these

See [migrated context](backlog/reference/migrated-todo-context.md#landed-structural-wins-do-not-reopen-these).

### Decisions and rejected approaches

See [migrated context](backlog/reference/migrated-todo-context.md#decisions-and-rejected-approaches).

### Post-mortems whose lessons are still live

See [migrated context](backlog/reference/migrated-todo-context.md#post-mortems-whose-lessons-are-still-live).

### Parked, deliberately

See [migrated context](backlog/reference/migrated-todo-context.md#parked-deliberately).

### Detailed design records

See [migrated context](backlog/reference/migrated-todo-context.md#detailed-design-records).

### Full ticket history

See [migrated context](backlog/reference/migrated-todo-context.md#full-ticket-history).
