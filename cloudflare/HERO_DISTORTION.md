# Interactive hero: React Bits Grid Distortion

## Design and scope

Preserve-mode enhancement of Tinytrail's product landing page: retain orange #ff5e1f with white primary-action text, self-hosted Manrope, the user logo, Kumo light/dark neutrals, headline/copy, navigation anchors and link/QR conversion flow. Replace the split hero art panel with one continuous full-width, 600px desktop scene. Mobile keeps copy above a smaller art surface. Existing app/auth/database behavior is unchanged.

Design dials: variance 6, motion 6, density 3. This is a motion/hero recomposition, not an information architecture change. Existing brand color and CTA text preferences take precedence over generic skill palette defaults.

## Exact registry component

- Registry: https://reactbits.dev/r/GridDistortion-TS-TW.json
- Docs: https://reactbits.dev/backgrounds/grid-distortion
- Exact unmodified TypeScript/Tailwind source: ui/components/GridDistortion.tsx
- SHA-256: 24e0f415cca31a9e737ed985d8dd414d97c1628a969a4edd68707942f91f04e0
- The retrieved registry lists dependencies as an empty array. Existing React/React DOM are reused, so no dependency installation or Bun/shadcn project migration was needed.
- Existing esbuild compiles TSX; the project's Kumo standalone Tailwind stylesheet supplies utilities. Explicit scoped layout rules also keep the effect's root/canvas dimensions independent of utility scanning.
- Full upstream MIT + Commons Clause license is retained in ui/components/REACT_BITS_LICENSE.md and copied to the public build. It is used as part of this app, not sold as a component pack.

The wrapper ui/hero-motion.tsx passes the requested values unchanged: grid 15, radius 0.18, strength 0.15, relaxation 0.96, mode drag, softness 0, chroma 0, idle 0.3, clickRipple true and intro true. Pointer listeners are passive and do not block navigation or scrolling. CSS reveals the existing copy once. The later TechText integration adds a separate headline effect; see TECH_TEXT.md. Buttons retain their normal clickable presentation.

## Runtime and fallbacks

- The existing shared React bundle mounts the effect only when the homepage mount exists. No second React runtime is added; the gzip bundle increase is about 4.6KB.
- Dedicated light/dark panoramic assets update with the appearance menu. On mobile the original centered art remains the better crop.
- A still image remains under the transparent canvas, including before the texture is ready and if WebGL is unavailable. No API or third-party rendering service is used.
- A keyboard-accessible Pause motion / Play motion button saves the browser preference. Reduced motion removes the canvas and motion button; data-saving connections start paused. Returning from another route retains pause preference.
- The effect unmounts when out of view or the document is hidden, disposing its listeners, observers, RAF and GPU resources. Canvas context loss also falls back to still art.
- CSP remains strict; no unsafe-inline, unsafe-eval, CDN or remote font allowance was added. QR/print assets and authentication state are untouched.

## Generated assets and prompt set

Built-in image_gen edits, not the CLI fallback. Original generated files are retained under the Codex generated_images directory. Only WebP format conversion was performed locally.

Saved project assets, 1942 x 809:

- ui/hero-grid-light.webp (19,900 bytes)
- ui/hero-grid-dark.webp (29,252 bytes)

Reference files: ui/landing-hero.webp and ui/landing-hero-dark.webp. The previous assets remain in use on mobile and sign-in.

Exact prompt template, substituting BACKDROP below for each variant:

> Edit this Tinytrail reference into a premium panoramic website hero background, ideally 2400x1000 wide landscape. Preserve the same interlocking chunky rounded orange and porcelain white chain links, high quality tactile 3D materials, and a few little trailing orange/white cubes. Recompose the entire sculpture so it occupies only the RIGHT 42 percent of the frame, centered at x=76%, y=53%, fully visible with breathing room. The LEFT 55 percent must be almost completely empty uninterrupted BACKDROP. Background across the entire width is BACKDROP. No split panel, no vertical dividing line, no text, no logos, no UI, no QR symbols. Composition must tolerate cropping the top/bottom into a 2.4:1 hero while keeping the chain visible and the left half empty for typography. Match the existing orange-white brand, clean editorial product photography, purposeful quiet negative space. This will be an interactive image background so keep crisp sculptural edges, no motion blur.

Light BACKDROP: a seamless very pale neutral off-white (#f7f7f7) studio floor/backdrop with softly lit contact shadows.

Dark BACKDROP: a seamless near-black charcoal (#0b0b0b) studio floor/backdrop with subtle warm reflections and sculptural rim lighting.

## Validation

npm run test:hero:browser creates a disposable QA page to isolate WebGL fault injection. It verifies actual rendered GPU pixels, pointer/click rendering and no GL errors, full hero width, pause/reload behavior, theme assets, 1440/768/390/320px layouts, reduced-motion changes, offscreen teardown/resume, unavailable WebGL fallback, strict CSP, and the original QR draft/sign-in handoff. It runs against local or BASE_URL staging/production without sending registration emails or creating production content.

The existing sign-in/account browser suite also passes with the shared bundle. Browser screenshots are in ignored .qa. No physical-device claims or changes to deferred Wallet/HubSpot acceptance are made.

## Deployment

Deployment versions and live acceptance are recorded after release. Roll back Worker/assets together if required. No migration or production database export is involved.

Staging Worker: d19e7dde-4ce0-43d4-b4b1-6a55f77f38ab. Production Worker: d7b5fd49-2737-45cc-b63a-6c3b6e4965a9. The complete hero browser suite passed against both deployed sites, including actual GPU pixels and no GL/CSP errors. Previous production Worker bb1726d3-5010-4001-9da9-7daf1b525efb is the preceding release.
