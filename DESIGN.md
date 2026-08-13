# Open Sessionboard Design System

## 1. Product character

The organizer workspace is a cool, precise operations surface: Linear's compact
application density with Notion's quiet grouping and readable hierarchy. It must
feel digital and operational, never warm-paper, editorial, or marketing-like.

The public marketing surface keeps that same operational character at a calmer
scale. It is product-led rather than decorative: visitors should see a legible
conference workflow before they are asked to believe feature claims. The visual
signature is a large, dimensional agenda workspace with draft, validation, and
published-revision states visible in one composition. Marketing copy is specific,
measured, and human-authoritative; avoid generic productivity language, fake
social proof, and automation-as-authority framing.

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

- UI family: Inter with system sans fallbacks.
- Workhorse weights: 520 for navigation, 590-650 for emphasis, 680 for page
  titles. Avoid traditional 700+ dashboard heaviness.
- Page title: 24-32px, tight tracking.
- Panel title: 12-13px.
- Navigation and rows: 10-12px.
- Metrics use tabular numerals and compact negative tracking.
- Marketing display: 56-72px desktop, 38-48px mobile, weight 620-680,
  line-height 0.98-1.04, balanced wrapping.
- Marketing body: 16-19px, maximum 62 characters per line.

## 4. Layout and responsive behavior

- Desktop uses a fixed shadcn sidebar and a single main document scroll.
- Main content is capped at 1180px with 24px desktop gutters.
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
- `SidebarGroup`: workflow label plus compact menu rows; default, hover, active,
  keyboard-focus, collapsed-tooltip, and mobile-drawer states.
- `CommandPalette`: trigger, dim backdrop, focused search, result rows, Escape
  close, backdrop close, query filtering, and an explicit no-results state.
- `MetricStrip`: bordered panel containing five contiguous metric cells;
  loaded, refreshing, unavailable, and stale states.
- `AttentionList`: compact task rows with semantic warning/failure markers and
  action buttons; empty, loading, stale, and unavailable states.
- `EventsPanel`: compact table on desktop and cards on mobile; empty, loaded,
  and stale states.
- `MarketingHero`: outcome-led copy, evaluation CTA, product proof frame, and
  concise capability strip.
- `AgendaProductFrame`: reusable static product composition with draft schedule,
  safety validation, and publication states. It is real DOM, never a pasted
  screenshot.
- `WorkflowProof`: four-step journey pairing concise copy with recognizable
  product micro-surfaces.
- `RoleSurface`: organizer, reviewer, and speaker cards with distinct product
  previews rather than interchangeable feature-card copy.
- Scoped workflow routes must retain organization and event context in every
  tab, breadcrumb, command result, and sidebar link. Integrations belong under
  the event-scoped `Publish & measure` group.

## 6. Motion and interaction

- Motion only communicates navigation, drawer, dialog, hover, focus, or state
  change.
- Use transform and opacity for animated transitions.
- Marketing product previews may lift by 2px on hover only when the entire
  preview is linked; static preview elements do not animate.
- Keyboard focus must remain visible with the focus token.
- `Cmd/Ctrl+K` opens and focuses search; Escape closes it.

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

- Legacy organizer screens continue to share `admin-shell.module.css`; the new
  shell and overview styles are scoped through explicit CSS module classes
  rather than global data-slot selectors.
- The marketing page uses scoped global `home-*` classes while the broader app
  continues its CSS-module migration.
- The initial marketing product proof uses representative static DOM data rather
  than an authenticated live dashboard embed, so the landing page remains
  fast, privacy-safe, and deterministic.
