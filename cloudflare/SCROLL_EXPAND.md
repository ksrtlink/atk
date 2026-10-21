# Sharing section: ScrollExpand

The user supplied the complete React Bits TypeScript/Tailwind ScrollExpand source in the pasted attachment. It is copied without behavioral changes to ui/components/ScrollExpand.tsx. SHA-256: 12c9ffa25af33cd42a02768abe0682ea9dcf5fc517e3154f0818f4278e770f2c; provenance is retained alongside it. It imports only existing React hooks, so no additional dependencies or toolchain migration were needed. The existing React Bits license notice remains with the component sources.

## Presentation

The Everything you share. A little more you. section retains its original orange/white artwork, wording, semantic heading and highlights. On desktop, a short introduction precedes a framed image that opens to full width using native page scroll. The image settles from 1.15x zoom to 1x; the existing highlights fade into a Kumo-themed caption panel. Light/dark assets follow the current appearance setting. No video, autoplay audio, custom scrollbar, wheel interception or nested scroller is introduced.

Props: useWindowScroll true; startWidth 68, startHeight 70, startRadius 12, endRadius 0, mediaZoom 1.15, scrollDistance 0.65, holdDistance 0.1, smoothing 0.1, overlayScrim 0. The wrapper leaves the supplied component unchanged and provides explicit scoped CSS for its Tailwind layout because arbitrary utility scanning is not part of this app's build.

## Fallback and accessibility

The original static image/copy remains the server-rendered fallback. Desktop enhancement keeps that semantic copy available to assistive technology and marks its animated visual duplicate aria-hidden; there is one accessible original h2. Mobile/tablet widths up to 768px, short landscapes up to 560px height, reduced-motion preference, the existing Pause motion setting and data-saving initial preference use the normal static section. JavaScript is not needed to read it.

The hero's existing Pause/Play control publishes a local motion event consumed by this section. ScrollExpand disconnects its passive scroll/resize listeners, observer and RAF on unmount. The transition uses the supplied component's native scroll handler; this is intentional use of the user's requested source. CSP is unchanged. No routes, auth rules, links, QR generation, public content or database schema are changed.

Scrolling tests exposed a small pre-existing TechText readiness race during offscreen unmount. Its wrapper now checks that the ref is still present before querying canvases. The upstream TechText source is unchanged.

## Validation

npm run test:scroll-expand:browser verifies actual initial/mid/full clip-path geometry, sticky stage position, zoom settling, caption visibility, theme image changes, one accessible original heading, global pause, live reduced-motion switching, tablet/mobile/short-landscape static layouts, anchor navigation and strict CSP. Disposable QA pages isolate each run. The existing TechText browser suite also passes after the cleanup fix.

Deployed versions and live acceptance are recorded below after release. No production records or emails are created by these checks. No database migration or export is involved.

Staging Worker 221b6e90-22ec-4861-81e6-51a8315e69b1 and production Worker 52368a76-cf31-47bb-a1a7-d476ed68559c both passed the complete deployed scroll suite, including 1024x480 short-landscape fallback. Previous production Worker 8f49e201-48f3-477a-aa0c-9f4bf293eaae is the preceding release.
