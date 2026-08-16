# Eventloom Design System

## 0. Authority and superseded references

This file is the canonical visual and interaction contract for every Eventloom
surface: marketing, organizer administration, reviewer work,
speaker portal, public event views, embeds, and CFP.

Competition briefs, source-product screenshots, evaluator evidence, and prior
clone notes are product-discovery and historical artifacts only. They may
explain required capabilities, but they do not define layout, styling,
information architecture, component behavior, or interaction patterns. When
those artifacts conflict with this file, this file wins.

Eventloom is not a pixel-for-pixel reproduction of Sessionboard,
Accelevents, Airtable, or any other source product. Linear is a quality
reference for product principles, not a template to copy literally. Reuse its
precision, speed, density, keyboard fluency, and calm hierarchy while preserving
Eventloom's own event-program vocabulary and workflows.

## 1. Product character

The product is a cool, precise program-operations surface: Linear's compact
application density, calm hierarchy, and keyboard fluency applied to conference
program work. It must feel digital, operational, fast, and coherent, never
warm-paper, decorative, or like a collection of unrelated admin templates.

The public marketing surface keeps that same operational character at a calmer
scale. It is product-led rather than decorative: visitors should see a legible
conference workflow before they are asked to believe feature claims. The visual
signature is a large, dimensional agenda workspace with draft, validation, and
published-revision states visible in one composition. Marketing copy is specific,
measured, and human-authoritative; avoid generic productivity language, fake
social proof, and automation-as-authority framing.

### Product-wide principles

1. **One object model.** Organization, event, submission, review, session,
   speaker, task, communication, and publication are recognizable objects with
   consistent names, metadata, status treatment, and detail layouts.
2. **Context never disappears.** Every scoped surface shows where the user is,
   which event or organization is active, and how to move to adjacent work
   without returning to a dashboard.
3. **Work before decoration.** The primary action, current status, next
   decision, and blocking issue are visible before supporting explanation.
4. **Progressive disclosure.** Dense information is welcome; simultaneous
   visual competition is not. Secondary controls move into menus, inspectors,
   tabs, or command actions.
5. **Keyboard and pointer parity.** Search, navigation, selection, and common
   actions are fast by keyboard while remaining obvious and usable by pointer.
6. **Calm operational feedback.** Loading, saving, stale data, permissions,
   errors, and completed work use stable inline states rather than surprising
   layout shifts or decorative alerts.

### Surface hierarchy

The product uses four recurring surface levels:

- **Workspace shell:** global navigation, organization/event switcher, command
  palette, and account controls.
- **Collection view:** filterable table, list, board, or timeline with saved
  views, counts, bulk selection, and one clear creation action.
- **Object detail:** persistent object identity, metadata, status, activity,
  and a contextual inspector or action rail.
- **Focused flow:** CFP, setup, review scoring, and other multi-step tasks that
  remove unrelated navigation while preserving progress and exit context.

Pages may vary in content density, but they must be composed from these shared
levels rather than inventing a new visual grammar per feature.

### Event creation and collection states

- Event creation is a focused setup flow, not a dump of the event schema.
  Constrain the editor to a readable settings width and use one column whenever
  the shell leaves less than two comfortable fields.
- Keep identity, canonical time zone, dates, and public location visible. Put
  optional CFP scheduling behind progressive disclosure.
- The event name is the editable display title. The public slug is the
  organization-scoped human identifier and should disambiguate similar names
  in organizer-facing navigation. The normalized event ID remains a separate
  stable routing and data-isolation identifier, but belongs only in explicitly
  labeled technical or diagnostic surfaces.
- New-event date controls disallow dates before the current day in the selected
  event time zone. End and CFP-close controls inherit the corresponding
  start/open lower bound.
- Do not expose duplicated or unconsumed calendar-delivery metadata during
  creation. Calendar defaults inherit the event time zone and location until a
  real downstream configuration surface exists.
- A successful collection response with zero records is an empty state. A
  missing optional workflow such as CFP intake is a setup state with a direct
  configuration action. Transport, authorization, and server failures are
  error states with recovery guidance.

## 2. Tokens

- Canvas: `#f7f7f8`
- Sidebar: `#f3f3f5`
- Surface: `#ffffff`
- Primary ink: `#1b1b1f`
- Secondary ink: `#56565d`
- Muted ink: `#929299`
- Border: `#e4e4e7`
- Strong border: `#d2d2d6`
- Selection: `#e7e7ea`
- Focus: `#4f46e5`
- Success surface/text: `#e9f7f1` / `#17835c`
- Warning surface/text: `#fff5df` / `#a66811`
- Failure surface/text: `#fff0ee` / `#c44138`
- Radius: 6px controls, 9px panels, full-pill status only
- Spacing rhythm: 4px base; primary increments 8, 12, 16, 24, 32px
- Marketing atmosphere: cool white-to-indigo wash, subtle 24px grid, one
  directional glow behind the product workspace
- Marketing product frame: 12px outer radius, 1px cool border, layered cool
  shadow, tighter 6-9px radii for nested product controls

## 3. Typography

- UI family: Inter Variable, loaded once at the application root, with system
  sans fallbacks. Component styles must consume the shared font token rather
  than naming an unloaded family directly.
- Enable optical sizing, antialiasing, and Inter's legibility alternates for
  ambiguous UI glyphs. Disable synthetic bold and italic faces.
- Workhorse weights: 480-520 for navigation and ordinary controls, 590-620 for
  emphasis, and 640-680 for page titles. Reserve 700+ for exceptional display
  moments rather than routine dashboard hierarchy.
- Page title: 24-32px, tight tracking.
- Panel title: 12-13px.
- Navigation and rows: 12-14px. Captions may use 11px when contrast and spacing
  keep them readable.
- Dense UI copy uses 1.4-1.5 line-height; paragraphs, abstracts, notes, and other
  reading content use 1.55-1.7.
- Headings use -0.02em to -0.035em tracking. Body copy stays at normal tracking;
  uppercase captions use restrained positive tracking.
- Metrics use tabular numerals and compact negative tracking.
- Marketing display: 56-72px desktop, 38-48px mobile, weight 620-680,
  line-height 0.98-1.04, balanced wrapping.
- Marketing body: 16-19px, maximum 62 characters per line.

## 4. Layout and responsive behavior

- Desktop uses a fixed shadcn sidebar and a single main document scroll.
- Main content is capped at 1180px with 24px desktop gutters.
- Collection-heavy workspaces may use the full available content width when
  columns, timelines, or split panes benefit from it; text-heavy detail content
  remains constrained for scanability.
- Page headers use one stable order: breadcrumb or scope context, title and
  status, concise supporting metadata, then actions. Do not stack multiple
  competing hero cards above operational content.
- Collection pages use a compact control bar for view, filter, search, sort,
  grouping, and bulk actions. The control bar remains visually subordinate to
  the collection itself.
- Detail pages use a main work region plus an optional contextual inspector.
  Metadata should not be repeated in several disconnected cards.
- Metrics are five columns on wide screens, two columns below 992px, and remain
  contained without page-level horizontal overflow.
- Event tables own horizontal overflow; mobile uses event cards instead.
- Below the shadcn mobile breakpoint the sidebar becomes an accessible drawer.
- Full-height regions use dynamic viewport units.
- Marketing sections follow the visitor decision path: hook, prove the product,
  explain the workflow, show role-specific surfaces, establish trust, convert.
- The hero product frame is centered below the copy on wide screens and remains
  horizontally legible without page overflow on small screens.

## 5. Reusable primitives and states

- `AdminShell`: cool canvas, grouped sidebar, sticky context bar.
- `WorkspaceHeader`: breadcrumb or scope switcher, object identity, status,
  supporting metadata, and ordered primary/secondary actions.
- `CollectionToolbar`: view switcher, query, filters, sort, grouping, saved
  views, selection count, and creation action.
- `ObjectList` / `DataTable`: compact selectable rows with stable columns,
  keyboard focus, inline status, contextual actions, empty state, and bulk
  state.
- `ObjectDetail`: title and status header, tabbed or segmented work region,
  activity trail, and optional inspector.
- `Inspector`: right-side contextual metadata and actions that can collapse
  without hiding essential information.
- `StatusBadge`: shared semantic vocabulary across submissions, reviews,
  sessions, speakers, tasks, communications, and publication.
- `EmptyState`: explains why the collection is empty and offers one relevant
  next action; it is not a marketing card.
- `SidebarGroup`: workflow label plus compact menu rows; default, hover, active,
  keyboard-focus, collapsed-tooltip, and mobile-drawer states.
- `SettingsShell`: scoped breadcrumb and identity, grouped local navigation, one
  focused destination, and a compact mobile destination selector. Settings
  destinations own stable URLs rather than scroll-position state.
- `SettingGroup`: one quiet bounded surface for a related configuration domain;
  rows use separators instead of nested cards and expose a single creation
  action in the group header.
- `SettingRow`: primary label, optional supporting copy, right-aligned value or
  switch, and a contextual action menu. Destructive actions stay inside the
  menu and require confirmation.
- `RevisionInspector`: chronological change rows open a right-side sheet with
  actor, time, version transition, semantic before/after differences, and
  technical identifiers behind progressive disclosure.
- `CommandPalette`: trigger, dim backdrop, focused search, grouped event and
  page results, current-route suppression, loading/unavailable/no-results
  states, active-row treatment, and a compact keyboard-hint footer. Results
  preserve organization and event scope rather than linking to generic routes.
- `MetricStrip`: bordered panel containing five contiguous metric cells;
  loaded, refreshing, unavailable, and stale states.
- `AttentionList`: compact task rows with semantic warning/failure markers and
  action buttons; empty, loading, stale, and unavailable states.
- `EventsPanel`: compact table on desktop and cards on mobile; empty, loaded,
  and stale states.
- `AgendaTimetable`: planning-first organizer surface with a bounded
  accepted-session tray and a selected-day time-by-room grid. The tray renders
  at most six sessions; larger queues add inline search and a temporary
  inventory dialog with track, format, duration, and sort controls. Session
  cards use position for start time and height for duration; conflicts stay
  visible in place. Dropping a session onto a room interval prefills an
  explicit placement form rather than silently mutating the draft. Desktop
  keeps the compact tray and timetable in one bounded workspace. Narrow screens
  replace the two-dimensional grid with chronological room sections, make the
  queue browser full-screen, keep date navigation and placement actions
  visible, and retain the list view as the accessible non-spatial fallback.
  Validation and immutable publication follow the planning surface instead of
  preceding it.
- `MarketingHero`: outcome-led copy, evaluation CTA, product proof frame, and
  concise capability strip.
- `AgendaProductFrame`: reusable static product composition with draft schedule,
  safety validation, and publication states. It is real DOM, never a pasted
  screenshot.
- `WorkflowProof`: four-step journey pairing concise copy with recognizable
  product micro-surfaces.
- `RoleSurface`: organizer, reviewer, and speaker cards with distinct product
  previews rather than interchangeable feature-card copy.
- `LegalDocument`: public policy shell with product navigation, effective-date
  metadata, plain-language summary, sticky section index, readable prose
  measure, print treatment, and a shared legal footer.
- Scoped workflow routes must retain organization and event context in every
  tab, breadcrumb, command result, and sidebar link. Integrations belong under
  the event-scoped `Publish & measure` group.

### Priority reference surfaces

The first redesign wave establishes reusable patterns through these five
surfaces:

1. **Event workspace overview** - defines event context, workflow navigation,
   operational summary, and next actions.
2. **Submission collection** - defines dense collections, saved views, filters,
   selection, status, and bulk decisions.
3. **Submission detail** - defines object detail, review context, metadata,
   activity, and consequential actions.
4. **Agenda workspace** - defines high-density planning, timeline interaction,
   validation, conflicts, and publication state.
5. **Speaker portal home** - proves the same system can become calm and
   task-oriented for an external participant without turning into a separate
   product.

CFP and reviewer flows inherit the focused-flow, object-detail, status, and
progress patterns established by this wave.

## 6. Motion and interaction

- Motion only communicates navigation, drawer, dialog, hover, focus, or state
  change.
- Use transform and opacity for animated transitions.
- Marketing product previews may lift by 2px on hover only when the entire
  preview is linked; static preview elements do not animate.
- Keyboard focus must remain visible with the focus token.
- `Cmd/Ctrl+K` opens and focuses search; Arrow keys move the active result,
  Enter opens it, and Escape closes the palette.

## 7. Accessibility constraints

- Preserve semantic landmarks, table headers, dialog naming, live regions, and
  explicit empty/error messages.
- Do not use color as the sole status signal.
- Compact controls must retain usable pointer targets through row height and
  padding.
- Decorative product previews use `aria-hidden`; equivalent feature meaning must
  remain present in nearby text.
- Marketing copy and controls must preserve readable contrast in both themes,
  and product frames must not require horizontal page scrolling.

## 8. Accepted debt

- Existing organizer, reviewer, speaker, CFP, public, and embed pages do not yet
  consistently implement the workspace, collection, detail, and focused-flow
  hierarchy above. This is active design debt, not precedent for new pages.
- Legacy organizer screens continue to share `admin-shell.module.css`; migrate
  toward shared shell, collection, detail, inspector, and status primitives
  rather than adding feature-specific visual systems.
- The marketing page uses scoped global `home-*` classes while the broader app
  continues its CSS-module migration.
- The initial marketing product proof uses representative static DOM data rather
  than an authenticated live dashboard embed, so the landing page remains
  fast, privacy-safe, and deterministic.

## 9. Reviewer collection and scorecard drawer

### 9.1 Reviewer queue

- The reviewer queue is a collection surface, not a permanent list-detail
  split. It uses the full available content canvas so submission titles,
  assignment context, filters, due dates, and status remain readable.
- The page header is a compact title, not a dashboard hero. A single icon-only
  filter trigger sits at the collection edge. Status filtering belongs inside
  the same compact menu as organization, event, round, track, due, and grouping;
  never render a permanent row of status tabs.
- Assigned submissions use one Linear-like collection grammar: no bordered
  table and no row-by-row card chrome. Desktop uses a concise labeled grid for
  Title, Event / round, Due, and Status, plus an unlabeled open action.
  Labels are muted, regular-weight, and aligned to the exact row columns rather
  than styled as small bold admin-table headings. Phones wrap the same
  information into a compact summary with status and action paired beneath it.
- Rows float on the collection surface without permanent separators. Hover,
  focus, selected, overdue, and completion states use restrained token-based
  background or inset emphasis.
- The title is the primary row label and remains one line. Long titles use
  ellipsis while preserving the complete accessible name and native hover
  disclosure. Event, round, track, and due date are muted aligned context;
  status and the open action stay visually paired.
- The default queue is ungrouped. Reviewers may opt into organization, event,
  round, or due-date grouping from the filter menu. The menu is a narrow,
  borderless stack of labeled value rows rather than a grid of boxed form
  fields.
- Raw UUIDs, database keys, provider identifiers, and submission references
  never appear in the reviewer queue. The title and review-round context are the
  reviewer-facing identity; the focused drawer may retain its short reference
  only where direct support disambiguation is useful.

### 9.2 Review drawer

- Opening an assignment slides a focused scorecard sheet from the right while
  retaining the queue as spatial context. The sheet is the only detail surface;
  do not keep a second permanent detail column behind it.
- On wide screens the sheet is between 38rem and 56rem wide and never exceeds
  roughly two-thirds of the workspace. Below the tablet breakpoint it becomes a
  full-screen sheet.
- The sheet has a compact sticky toolbar with close, previous/next assignment,
  and the short submission reference. Focus moves into the sheet on open,
  Escape closes it when autosave permits, and focus returns to the originating
  queue row.
- Submission context is presented as concise metadata followed by the abstract
  and reviewer-visible fields. The rubric remains one contiguous form with
  criterion-local advisory AI help, a single conflict path, autosave status,
  and one primary submit/progression action.
- The scorecard body scrolls independently. Its action bar stays visible without
  covering fields, works with the software keyboard, and respects safe-area
  insets.

### 9.3 Responsive and accessibility behavior

- Desktop rows preserve a stable identity/status/action rhythm beneath one quiet
  Linear-like label row. The labels and values share one grid definition;
  supporting metadata collapses before the title does.
- Phone rows become touch-safe stacked summaries with title, event/round,
  due/status, and one clear open action. No reviewer workflow requires
  horizontal scrolling.
- The drawer remains usable at 200% text zoom. Score choices wrap without
  clipping, focus remains visible, and sticky regions never obscure the active
  field.
- Motion communicates the drawer transition only, uses transform and opacity,
  and is removed under `prefers-reduced-motion`.
