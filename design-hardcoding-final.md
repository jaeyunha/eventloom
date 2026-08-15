# Frontend Design-System Hardcoding Audit

## Confirmed root-cause token violations

### 1. Competing theme contracts own the same semantics

The frontend has overlapping token systems with different values:

- Global application contract: `apps/web/src/app/globals.css:21-90`
- Legacy `--sb-*` contract: `apps/web/src/styles/tokens.css:1-37`
- Admin contracts: `apps/web/src/features/admin/admin-shell.module.css:2-20`, `31-56`, `2373-2397`

Ink, muted text, brand, semantic states, borders, radii, shadows, spacing, and typography therefore vary depending on whether a feature uses `--color-*`, shadcn variables, `--sb-*`, or `--admin-*`.

**Owner:** `apps/web/src/app/globals.css` should own application semantics. Legacy and admin contracts should alias global semantics or contain only intentionally scoped additions.

### 2. Semantic state palettes are reimplemented per feature

Info, success, warning, and danger colors are duplicated with different hues and contrast values:

- Shared workspace statuses: `apps/web/src/components/workspace/workspace-ui.module.css:141-161`
- Submission-local state variables: `apps/web/src/features/admin/submission-workspace.module.css:11-16`
- Portal badge tones: `apps/web/src/features/portal/portal.module.css:653-679`
- Review lifecycle states: `apps/web/src/features/reviews/review-workspace.module.css:2185-2213`
- Speaker task states: `apps/web/src/features/speakers/speaker-workspace.module.css:469-483`
- Integration states: `apps/web/src/features/integrations/integrations.module.css:422-441`
- Communications indicators: `apps/web/src/features/communications/communications-workspace.module.css:325`, `329`
- CRM success state: `apps/web/src/features/crm/crm-workspace.module.css:639-640`
- Deliverables success state: `apps/web/src/features/deliverables/deliverables-workspace.module.css:190-191`

**Owner:** extend `apps/web/src/app/globals.css:40-47,79-86` with complete `info`, `success`, `warning`, and `danger` ink/soft/border contracts, including dark-theme values.

### 3. Legacy literal fallbacks create an undocumented fourth palette

Feature modules use declarations such as `var(--color-ink, #25272d)` even though these variables are supplied globally. Their fallback values differ from the active theme and can surface in isolated or embedded rendering:

- CFP editor: `apps/web/src/features/admin/cfp-editor.module.css:5`, `14`, `21`, `40`, `80-101`
- Communications: `apps/web/src/features/communications/communications-workspace.module.css:4-5`, `20-32`, `52`
- CRM: `apps/web/src/features/crm/crm-workspace.module.css:4`, `19-35`, `108-110`, `148-171`
- Deliverables: `apps/web/src/features/deliverables/deliverables-workspace.module.css:3`, `17`, `22`, `45`, `55`, `63-64`
- Reports: `apps/web/src/features/reports/reports-workspace.module.css:15`, `25-26`, `40`, `46`, `55`, `65`
- Embed administration: `apps/web/src/features/embeds-admin/embed-workspace.module.css:16-26`, `68`, `125`, `176`

**Owner:** consume guaranteed variables from `globals.css` directly. Admin descendants should consume the admin contract without embedding fallback colors.

### 4. Admin components bypass their own theme variables

`admin-shell.module.css` declares light and dark contracts, then hardcodes those same values throughout descendant rules:

- Base shell bypasses: `apps/web/src/features/admin/admin-shell.module.css:58-59`, `78`, `86`, `94-103`, `109-120`, `197-208`
- Compact-layout duplicates: `apps/web/src/features/admin/admin-shell.module.css:2091`, `2135-2155`, `2215-2253`, `2312-2342`
- Dark-theme duplicates: `apps/web/src/features/admin/admin-shell.module.css:2398-2440`, `2453-2485`, `2558-2605`
- Command-palette light/dark palettes: `apps/web/src/features/admin/admin-command-palette.module.css:12-35`, `49-66`, `117-130`, `271-312`

**Owner:** the scoped admin contracts at `apps/web/src/features/admin/admin-shell.module.css:2-20,31-56,2373-2397`. Missing overlay or elevation semantics should be added to that contract first.

### 5. Referenced theme tokens are undefined

These declarations can be discarded by CSS or render without their intended style:

- `--color-focus`: `apps/web/src/app/globals.css:2297`
- `--shadow-sm`: `apps/web/src/features/account/account-hub.module.css:131`
- `--shadow-xs`: `apps/web/src/features/speakers/speaker-workspace.module.css:172`
- `--shadow-md`: `apps/web/src/features/reviews/review-workspace.module.css:1127`
- `--color-surface-subtle`:
  - `apps/web/src/features/reviews/review-workspace.module.css:2225`
  - `apps/web/src/features/reviews/review-workspace.module.css:2243`
  - `apps/web/src/features/reviews/review-workspace.module.css:2256`
- Undefined `--font-mono` direct uses:
  - `apps/web/src/features/admin/submission-workspace.module.css:177`
  - `apps/web/src/features/reviews/organizer-review-overview.module.css:236`
- Undefined embed radii:
  - `apps/web/src/features/embed/embed.module.css:1210`, `1217`, `1224`, `1254`, `1293`, `1321`, `1381`, `1403`, `1419`, `1427`
- Undefined embed shadows:
  - `apps/web/src/features/embed/embed.module.css:1212`, `1226`, `1256`, `1295`, `1309`, `1382`, `1420`

**Owner:** define global focus, mono-font, surface, and elevation aliases in `globals.css`. Embed-only names belong in the `.embedRoot` contract at `apps/web/src/features/embed/embed.module.css:12-65`.

### 6. Member setup implements a separate inline design system

The setup screen hardcodes its canvas, card, border, radius, shadow, control sizing, muted text, error state, spacing, and primary action:

- Page/card/input objects: `apps/web/src/features/members/member-setup.tsx:89-115`
- Muted text: `apps/web/src/features/members/member-setup.tsx:229`, `266`
- Error color: `apps/web/src/features/members/member-setup.tsx:237`
- Form spacing: `apps/web/src/features/members/member-setup.tsx:241`
- Primary button: `apps/web/src/features/members/member-setup.tsx:286-294`

**Owner:** global semantic tokens and the existing `Card`, `Field`, `Input`, and `Button` primitives.

### 7. Elevation and stacking layers lack named scales

Repeated shadows and z-index values represent shared UI concepts but are not governed by tokens.

Raw elevation recipes include:

- `apps/web/src/features/admin/admin-command-palette.module.css:15-17`, `273-275`
- `apps/web/src/features/agenda/agenda-workspace.module.css:622`, `631`, `1269`, `1389`
- `apps/web/src/features/portal/portal.module.css:133`, `194`, `617`, `1214`, `1494`
- `apps/web/src/features/reviews/review-workspace.module.css:2503`, `2558`, `2844`
- `apps/web/src/features/settings/event-settings-workspace.module.css:163`, `187`

Repeated stacking roles include:

- Skip links: `apps/web/src/styles/design-system.module.css:16`, `apps/web/src/features/agenda/agenda-workspace.module.css:19`, `apps/web/src/features/portal/portal.module.css:16`
- Popovers and menus: `apps/web/src/styles/design-system.module.css:412`, `apps/web/src/features/portal/portal.module.css:124`, `183`, `apps/web/src/features/deliverables/deliverables-workspace.module.css:362`
- Command dialog and overlay: `apps/web/src/features/admin/admin-command-palette.module.css:2`, `21`

**Owner:** extend the global shadow scale at `apps/web/src/app/globals.css:48-52` and add named layers such as `--layer-sticky`, `--layer-popover`, `--layer-dialog`, and `--layer-skip-link`.

## Intentional exceptions

These literals should remain dynamic or component-specific:

- Progress geometry:
  - `apps/web/src/components/ui/progress.tsx:26`
  - `apps/web/src/features/admin/submission-workspace.tsx:1322`
  - `apps/web/src/features/portal/portal-ui.tsx:405`
- Runtime agenda track color:
  - `apps/web/src/features/agenda/agenda-workspace.tsx:337`
- Runtime image URLs:
  - `apps/web/src/features/embed/public-speakers-list.tsx:51`
  - `apps/web/src/features/embed/speaker-gallery.tsx:73`, `301`
- User-configurable embed colors:
  - `apps/web/src/features/embeds-admin/embed-workspace.tsx:174`, `925-926`, `1023`, `1047-1048`, `2113-2154`
  - These are persisted product data, though the repeated defaults should be consolidated into one exported TypeScript theme-default object.
- Component-specific geometry, responsive breakpoints, percentage widths, circular `50%` radii, visually hidden geometry, static decorative gradients, and static SVG artwork were intentionally not flagged.
