# Markdown Rendering Sandbox

This document describes the rendering and navigation boundary used by mdview `1.2.4`.

## Security objective

Opening a local Markdown file must not grant that document the capabilities of an application page. Markdown content is treated as untrusted input. It may describe formatted content, but it must not execute scripts, embed active documents, navigate the mdview webview, or make network requests unless the user explicitly enables the narrow remote-image preference.

The preview has two rendering boundaries:

1. Markdown and raw HTML are compiled by Marked, sanitized by DOMPurify, and filtered by mdview before insertion.
2. Mermaid source is rendered separately into SVG, so it receives both a source preflight and a second SVG sanitization pass.

## Markdown features that render

The parser uses GitHub-flavored Markdown and supports:

- headings
- paragraphs and line breaks
- emphasis, strong text, deletion, and inline code
- fenced code blocks
- blockquotes
- ordered and unordered lists
- task-list checkboxes
- tables
- horizontal rules
- links
- images subject to the image-resource policy
- `details` and `summary`
- Mermaid fenced blocks and promoted standalone Mermaid diagrams

## HTML allowlist

Raw HTML is never trusted as an unrestricted document. The sanitized preview allowlist contains:

- `a`
- `blockquote`
- `br`
- `code`
- `del`
- `details`
- `em`
- `h1` through `h6`
- `hr`
- `img`
- `input`
- `li`, `ol`, and `ul`
- `p`
- `pre`
- `strong`
- `summary`
- `table`, `thead`, `tbody`, `tr`, `th`, and `td`

Allowed attributes are limited to formatting and navigation metadata used by those elements: `alt`, `checked`, `class`, `disabled`, `href`, `rel`, `src`, `title`, `type`, and the controlled `target` attribute.

The following active-content surfaces are explicitly removed:

- scripts
- iframes
- objects and embeds
- forms
- audio and video
- source elements
- raw SVG and MathML supplied through Markdown
- inline event handlers
- arbitrary style elements and style attributes
- custom data attributes from document input

The disabled **Trusted HTML** control remains intentionally non-functional in this release. No document can bypass sanitization.

## Image-resource policy

Remote images are blocked by default before sanitized HTML is inserted into the preview DOM. The policy applies equally to Markdown image syntax and raw HTML `img` elements.

Allowed document inputs by default:

- relative image paths resolved from the opened Markdown file's directory
- blob URLs
- raster image data URLs for AVIF, BMP, GIF, JPEG, PNG, WebP, and supported icon formats

Relative paths do not enter the preview as privileged URLs. After the document source has passed the image policy, mdview resolves the path against the opened document and creates the Tauri asset URL itself.

Blocked document inputs by default:

- `http://` and `https://` images
- protocol-relative URLs such as `//example.com/image.png`
- `file://` URLs
- document-supplied `asset:` and `tauri:` URLs
- FTP and other unsupported URI schemes
- SVG data documents
- non-image data URLs such as `data:text/html`

When **Remote Images** is explicitly enabled, HTTP and HTTPS images are permitted. Protocol-relative image URLs are normalized to HTTPS.

Blocked image elements retain their alternative text but lose the source attribute, preventing a request from being issued.

## Mermaid boundary

Mermaid does not share the ordinary Markdown HTML pipeline. It generates SVG after the Markdown preview has already been inserted, so mdview applies additional controls:

1. Mermaid source is scanned before `mermaid.render` runs.
2. When remote images are disabled, diagrams containing HTTP, HTTPS, FTP, WebSocket, or protocol-relative resource references are not rendered.
3. Mermaid runs with `securityLevel: "strict"`.
4. Generated SVG is sanitized with the DOMPurify SVG profile.
5. Scripts, `foreignObject`, iframes, objects, and embeds are forbidden.
6. Remote `href`, `xlink:href`, `src`, and remote style references are stripped from generated SVG unless remote images are enabled.

The source preflight is deliberately conservative. A Mermaid label containing a literal external URL may be blocked even when it was intended only as text. This is preferable to starting a network request before post-render SVG sanitization can run.

## Link navigation

Rendered documents cannot navigate the mdview webview directly.

For every Markdown link:

- default browser/webview navigation is prevented
- event propagation is stopped
- HTTP and HTTPS links show a native Tauri confirmation dialog
- confirmed links open through the Tauri opener in the operating system's default browser
- declined links remain unopened
- opener failures are reported in a native error dialog
- local file links are not opened automatically
- unsupported schemes such as `javascript:`, `mailto:`, or custom protocols are blocked and explained in a native dialog
- same-document fragment links only scroll to an existing element ID

Primary clicks and middle clicks pass through the same confirmation policy. Link context menus are suppressed so the embedded webview cannot expose an unconfirmed direct-navigation action.

## Application CSP

The Tauri webview content-security policy provides a second containment layer:

- scripts are limited to the application itself
- frames, objects, media, and forms are disabled
- network connections are disabled through `connect-src 'none'`
- image network access exists only because the runtime remote-image preference may opt in; mdview's render filters enforce the per-document decision before insertion

## Validation coverage

The `1.2.4` regression suite covers:

- script and active HTML removal
- the raw HTML allowlist
- Markdown and raw HTML remote-image blocking
- protocol-relative and unsupported image schemes
- whitespace-normalized image URLs
- document-supplied Tauri asset scheme rejection
- safe raster image data URLs and blocked SVG data documents
- explicit remote-image opt-in
- Mermaid source network-resource detection
- Mermaid SVG script and remote-resource removal
- native external-link confirmation
- declined and failed browser opens
- blocked protocol messaging
- link context-menu suppression
- Mermaid preflight before renderer invocation

## Residual assumptions

- DOMPurify, Marked, Mermaid, Tauri, and the platform webview remain security dependencies and should be kept updated.
- The remote-image setting is global application state, not a per-document trust decision.
- Local relative image loading intentionally permits a document to display files referenced relative to its own location.
- mdview does not currently provide a host allowlist, one-time image consent, or per-document remembered trust.
