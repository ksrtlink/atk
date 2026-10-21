# React Bits TechText hero headline

The exact unmodified TS-TW registry source is ui/components/TechText.tsx. Registry: https://reactbits.dev/r/TechText-TS-TW.json. Docs: https://reactbits.dev/text-animations/tech-text. Retrieved 21 October 2026; SHA-256 a9293c3d7d04e7b13867b54ec64b47039640c828bf0adcad8e6e36a548e1281f. Provenance is retained alongside the component; the existing full React Bits MIT + Commons Clause license remains in REACT_BITS_LICENSE.md.

The registry lists no additional dependencies. Existing React, React DOM and esbuild are reused. The shared UI bundle now uses the automatic JSX runtime expected by this upstream variant. No Bun, Tailwind compiler, shadcn project migration, CDN or API service is required.

## Presentation

Each original hero line receives its own TechText instance: Share more. and Keep it simple. Font weight 600, fontSize 150, letter reveal, dash length 4, dash gap 2, 15 specks, no intro, introDuration 2, clickKick enabled and guides false match the requested effect. Left alignment, self-hosted Manrope, inherited brand colors and measured letter spacing adapt the demo to Tinytrail. The component's built-in fitting is supplied measured canvas dimensions so its 150px setting follows the existing responsive headline size rather than displaying a fixed oversized demo. Other effect options retain upstream defaults.

The real single h1 remains in server-rendered HTML with unchanged wording and two lines. Its text stays available to search and assistive technology. Decorative canvases are aria-hidden and replace only the visual text after both canvases paint. While loading, or if 2D canvas is unavailable, the HTML text stays visible. Layout does not depend on canvas output.

The existing Pause motion / Play motion control now governs both the text and GridDistortion. Reduced motion, data-saving initial preference, offscreen and document-visibility behavior are shared. WebGL failure does not disable a working 2D text effect or remove its pause control. Light/dark changes remount the text with updated colors. No authentication, link/QR behavior, database or public content changes are included.

## Checks

npm run test:tech-text:browser checks actual nonempty canvas pixels, hover/click visual changes, one correctly named accessible h1, HTML fallback, both themes, shared pause/reduced-motion/offscreen behavior, unavailable 2D fallback, responsive 1440/768/390/320 layouts and strict CSP. Disposable QA pages isolate canvas fault injection.

The existing GridDistortion hero/handoff suite is retained as regression coverage. Deployment versions and live acceptance are recorded below after release. No database migration or production data export is involved.

Local TechText and existing hero/handoff checks passed. The complete TechText browser suite also passed against staging Worker 94f5a64b-8454-42f5-9c25-2b740c356fa4 and production Worker 8f49e201-48f3-477a-aa0c-9f4bf293eaae, including actual canvas output, the accessible heading, interactions and strict CSP. Previous production Worker d7b5fd49-2737-45cc-b63a-6c3b6e4965a9 is the preceding release.
