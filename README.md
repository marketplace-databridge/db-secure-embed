# DataBridge Secure Embed

A Qlik Sense extension that shows web pages inside a sheet, or as a link card, only when the site is on an administrator allowlist. It replaces the *Website* mode of the legacy **Media Box** extension (`swr-mediabox`). Media Box hasn't been updated since 2018.

It's built with **nebula.js 7.9** (Qlik's current open-source visualization framework) and packaged as a client-managed extension. The same code can later be deployed to Qlik Cloud.

## Why it is safer than Media Box

| Risk | Media Box | Secure Embed |
|---|---|---|
| Which sites can be embedded | Any URL an editor types or an expression returns | Only sites on `allowlist.json`. Only admins can change that file (QMC import). If the file can't be loaded, everything is blocked. |
| Embedded page redirects the whole Qlik tab | Allowed (`allow-top-navigation`) | Top navigation can never be granted |
| `javascript:`, `data:`, `file:` URLs, credentials in a URL | Not checked | Rejected |
| Plain `http://` | Allowed | Blocked unless the allowlist entry sets `allowInsecureHttp: true` |
| Sandbox | One fixed, permissive set | Editor profile **∩** allowlist maximum. The result is never more than either side. |
| Embedding Qlik's own origin | Scripts plus same-origin, so the frame can escape its sandbox | `allow-same-origin` is removed automatically |
| Expression- or data-driven URLs | The whole URL can change | URL templates. Parameter values are URL-encoded and can't change the host. |
| Referrer (app and sheet IDs in the URL) | Sent | `no-referrer` by default. Editors can only pick a stricter policy than the allowlist entry. |
| Browser features (camera and so on) | Not controlled | Only fullscreen, autoplay, DRM, picture-in-picture, clipboard-write and web-share, each one limited by the allowlist |
| Free HTML mode | Yes | Not offered |
| Bundled libraries | AngularJS-era code, Video.js 4 (2014) | No runtime dependencies besides `@nebula.js/stardust` |

## Features

- **Embedded page** or **link card** (opens in a new tab, as Qlik recommends)
- **URL** (static or expression) or **URL template** with named parameters, e.g. `https://reports.example.com/region/{region}?year={year}`
- Sandbox profiles: *Locked*, *Standard*, *Media*, *Custom*
- Interaction modes: *always*, *click to activate* (stops the page from capturing scrolling on the sheet), *view only*
- Optional toolbar: title, site name, reload, open in new tab (top or bottom)
- Auto-refresh (minimum 15 s), lazy loading, and a hint after a load timeout ("some sites refuse to be embedded")
- Zoom 25–200 %, border, background colour (colour values only)
- **Policy badge in edit mode**: shows which allowlist entry matched, the effective sandbox, permissions and referrer, and warns about anything the allowlist removed
- Viewers only see a generic "blocked" message. Detailed reasons appear in edit mode only.
- Selections elsewhere in the app don't reload the embedded page. It reloads only when the URL or the security settings change.

## Install (QMC)

1. Edit `allowlist.json` (see below). The repo copy is the source of truth.
2. `npm ci && npm run package` → `build/db-secure-embed_v1.0.0.zip`
3. QMC → Extensions → Import → select the zip.
4. Generate the matching CSP header and add it as a second layer of defence:
   ```
   npm run csp
   ```
   Paste the output into QMC → Virtual proxies → *(each proxy users access)* → **Additional response headers**. Start with the `-Report-Only` variant on TEST.

Build requirements: Node ≥ 24.

## allowlist.json

```jsonc
{
  "defaults": { "referrerPolicy": "no-referrer" },
  "entries": [
    {
      "id": "youtube",
      "label": "YouTube (privacy-enhanced embeds)",
      "origins": ["https://www.youtube-nocookie.com"],   // scheme://host[:port]; "https://*.example.com" = any subdomain (not the apex)
      "pathPrefixes": ["/embed/"],                         // optional; "/video" matches "/video" and "/video/…", never "/videos-x"
      "maxSandbox": ["allow-scripts", "allow-same-origin", "allow-presentation", "allow-popups"],
      "allowFeatures": ["fullscreen", "autoplay"],
      "referrerPolicy": "strict-origin-when-cross-origin"  // optional per-entry override
    }
  ]
}
```

- If an entry omits `maxSandbox`, it gets `allow-scripts allow-forms allow-popups` (no `allow-same-origin`).
- Forbidden tokens (`allow-top-navigation*`, `allow-storage-access-by-user-activation`) are ignored.
- To change the list, edit the file, re-zip, and re-import via QMC. Then run `npm run csp` again.
- The allowlist is always loaded from the extension folder. There is deliberately no page-level override.
- `npm run package` refuses to zip placeholder entries (`*.example.com`). For a TEST build with the sample list, run `npm run package -- --allow-placeholder`.
- Template parameter values used in the URL path may not contain `..`.
- An entry with a malformed `pathPrefixes` (not an array, or a path without a leading `/`) is dropped, never widened to the whole origin. Paths whose decoded form contains a `..` segment (e.g. `..%2F`) never match a prefix.

## Development

```
npm test            # security-core unit tests (node:test)
npm run build       # nebula build → dist/
npm run sense       # wraps dist/ as a Sense extension → build/db-secure-embed/
npm run package     # build + sense + allowlist + zip
```

`test/harness/` renders the view in a plain page (esbuild bundle) for visual and browser checks without a Qlik server.

## Layout

```
src/index.js               nebula.js entry (hooks → controller)
src/ext.js                 property panel
src/object-properties.js   defaults
src/core/constants.js      security vocabulary (allowed / forbidden tokens, features, referrers)
src/core/allowlist.js      allowlist parsing, matching, loading (fail-closed)
src/core/policy.js         URL parsing, templates, policy engine (intersection logic)
src/core/model.js          layout → view model
src/core/view.js           DOM controller (no innerHTML with user data)
src/core/styles.js         scoped CSS
```

## Known limits

- The browser doesn't report whether a site refused to be framed (`X-Frame-Options` / `frame-ancestors`). That's why the timeout hint and the "open in new tab" button exist.
- In this version, the property panel can't read the allowlist, so editors see the policy result on the object itself (edit-mode badge).
- No exports, snapshots or NPrinting for embedded web content. The object reports these as unsupported.
