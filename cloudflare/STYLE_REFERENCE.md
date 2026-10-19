# TinyTrail layered interface — 19 October 2026

Native CSS and DOM adaptation of the user's Cloudflare dashboard reference. This supersedes the earlier flat, 2px-corner interpretation while preserving TinyTrail's orange identity and supplied SVG wordmark.

## Design resources and implementation

- Cloudflare Kumo LayerCard: https://kumo-ui.com/components/layer-card/ — nested neutral surfaces, restrained borders and soft elevation.
- Cloudflare Kumo Sidebar: https://kumo-ui.com/components/sidebar/ — icon navigation and compact mode.
- Phosphor Core: https://github.com/phosphor-icons/core — the same icon family used by Kumo examples. Exact build-only dependency 2.1.1; build emits a selected SVG sprite and includes its MIT notice. No icon JavaScript runtime or React migration.

`ui/theme.css` owns palette, radius, depth, glass and motion tokens. `ui/cloudflare-style.css` is the shared final presentation layer for landing, dashboard, bulk, analytics and dialogs. Shapes follow one scale: 6px small treatments, 8px controls, 12px panels and 16px hero/modal surfaces. Orange remains #ff5e1f; dark labels maintain contrast. QR ink and saved artwork retain their existing palette.

The shell and dialog chrome use translucent white with native backdrop blur; data surfaces remain readable white over a pale gray canvas. Reduced-transparency preferences produce opaque surfaces. System fallbacks are used for the named FT Kunst Grotesk/Apercu families because licensed font files are absent.

## Interaction scope and safeguards

- Sidebar has consistent Phosphor icons and an accessible collapse/expand control on desktop. Accessible labels and native titles remain in compact mode; mobile retains the scrollable labeled menu.
- Creation panel can be hidden/restored without discarding inputs. Only that boolean preference is stored locally; edit actions reopen the panel.
- QR dialog separates Content, Style and Export with accessible tab/tabpanel relationships, roving tabindex and Arrow/Home/End navigation. Long tracking explanation and workspace presets use native disclosures.
- Preview hides/restores independently. Minimize closes the modal and exposes Resume QR draft; URL, shapes, colors, tab and tracking identity remain in memory. Resume regenerates the preview from that draft. New QR actions intentionally replace the draft.
- Account/workspace changes clear minimized state, handler references, tracking identity and private form values. Hidden resume cannot reopen another workspace's draft.
- Selected shapes use a tinted fill and checkmark rather than a box outline. Keyboard focus remains a distinct 2px neutral ring; mouse button focus does not add the ring.
- Panels, tabs, dialogs and notices enter with a short opacity/6px translation. Buttons and navigation provide restrained hover/press feedback; sidebar collapse animates. Reduced-motion preference disables motion. No continuous animation loop was added.

No backend routes, authentication policy, database schema, record contents, quotas, existing redirects or tracking semantics changed.

## Verification and completion evidence

- `npm run build` emits the selected icon sprite and updated shared assets.
- `npm test`: 31 backend tests, including original eight links and workspace isolation.
- `node tests/browser-enterprise.mjs`: desktop/mobile theme/layout, sidebar icons/collapse, creation hide/restore, QR tabs and keyboard arrows, soft selection, preview toggle, minimize/resume draft retention, workspace-switch draft cleanup, reduced motion/transparency, hero handoffs, QR saves, link retry, company access, bulk ZIP/vector PDF exports and sign-out cleanup.
- `node tests/browser-analytics.mjs`: decoded individual/bulk tracked QR PNGs, unchanged identity through style edits, redirect updates, analytics/CSV reconciliation and privacy cleanup.
- Desktop and mobile screenshots reviewed for landing, dashboard and QR export/style states. Screenshots wait for finite animations before capture.

Browser tests use signed test identities and mocked Firebase responses in an isolated local harness; they do not send real verification emails. Production email delivery is outside this UI change.
