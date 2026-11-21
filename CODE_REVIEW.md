# Code Review — Portfolio Site & AI Assistant

**Date:** 2026-11-21 · **Branch reviewed:** `claude/code-review-comprehensive-a05991` (HEAD `8da8801`) · **No code was changed.**

## Scope

| Area | Files |
|---|---|
| Static site | `index.html`, `assets/css/site.css`, `assets/js/site.js`, images, `sitemap.xml` |
| AI assistant (client) | `assets/assistant/{widget,service,retrieval,knowledge,config}.mjs`, `assistant.css` |
| AI assistant (backend) | `assistant-backend/worker.mjs`, `wrangler.toml`, `README.md` |
| Build / CI | `scripts/build-static.mjs`, `.github/workflows/static.yml`, `.gitignore` |
| Tests | `tests/assistant.test.mjs` — **15/15 pass** (`node --test`) |

Vendored design tooling (`.agents/`, `.github/skills/`, `.github/agents/`) was reviewed only for its effect on the repo, not line by line.

## Overall assessment

This is a well-built project. The static site uses progressive enhancement, semantic landmarks, a skip link, `aria-*` on interactive controls, reduced-motion support, and a print stylesheet. The assistant is security-conscious: messages render only through `textContent`, source links go through an allowlist, the server owns retrieval, roles and sizes are validated, there are IP and global rate limits, it uses `store:false` and structured output, it fails closed when config is missing, and error messages are generic. The build publishes from an explicit allowlist.

The main gaps are:
- one confirmed conversation-state bug in the assistant
- cost and abuse exposure on the paid LLM endpoint
- privacy and compliance around third-party trackers and a phone number still in git history
- a few robustness and performance details
- repository hygiene

## Findings summary

| # | Severity | Area | Finding |
|---|---|---|---|
| 1 | **High** | Assistant | Consecutive `user` messages make the backend reject every AI request (confirmed) |
| 2 | **High** | Backend / cost | No daily spend cap. The `Origin` check can be spoofed, so the global limit allows about 170k paid calls a day |
| 3 | **High** | Privacy | The removed phone number is still in public git history. Check the CV PDF as well |
| 4 | Medium | Privacy / legal | Google Analytics and Google Fonts load with no consent step or privacy notice |
| 5 | Medium | Backend ops | Observability is disabled and the model name is unverified, so failures go unnoticed |
| 6 | Medium | Robustness | If `site.js` fails to load, all `.reveal` content stays invisible |
| 7 | Medium | Performance | The hero entrance animation delays LCP; the WebP and PNG portrait fallbacks are heavy or low-resolution |
| 8 | Medium | Content integrity | JSON-LD claims "Swift", which contradicts the site and assistant ("iOS fundamentals, not advanced Swift") |
| 9 | Medium | Build | The publish step uses a denylist inside `assets/`, so new source images ship by default |
| 10 | Medium | Security headers | No Content-Security-Policy |
| 11 | Low | Backend config | `http://localhost:4173` is in the production `ALLOWED_ORIGINS` |
| 12 | Low | CI | Tests run only when deploying `main`. No PR checks, linting, link checks or Lighthouse. Actions are not pinned to a SHA |
| 13 | Low | Caching | Manual `?v=N` cache-busting is inconsistent across module imports |
| 14 | Low | Assistant UX / a11y | Dead `welcome.replace(...)` code. Opening the dialog forces the keyboard up on mobile. Count-up text is announced as "0" |
| 15 | Low | Content | Assistant knowledge (`verifiedAt 2026-10-31`) can drift from `index.html` with nothing to catch it |
| 16 | Low | Links | CV links are absolute production URLs. Play Store "search" URLs are fragile. Certificate URLs leak the `?u=` org ID |
| 17 | Low | Repo hygiene | `.DS_Store` is tracked, plus review screenshots, unused source photos (about 0.8 MB) and several MB of vendored tooling with an edit hook |

---

## Remediation status (2026-11-21)

| # | Status |
|---|---|
| 1 | **Fixed.** `service.mjs` now builds the payload with `toTranscript()`, which collapses same-role runs (keeping the latest), drops a trailing unanswered user turn, and skips empty or malformed entries. A regression test covers restored, aborted, repeated and long histories against the real server validator. Cache-busting versions were bumped (`widget.mjs?v=7`, `service.mjs?v=3`). |
| 2 | **Partly fixed in code.** The worker now enforces a hard global daily cap (`DAILY_REQUEST_LIMIT`, default 500 per UTC day) through a `DailyBudget` Durable Object. Only valid requests count, it returns 429 with `Retry-After` set to UTC midnight, and it fails closed when misconfigured. Tests cover all of this. **Still needed from you:** deploy the worker, which applies the `v1-daily-budget` migration, and set an OpenAI project budget and usage limit. Turnstile and top-k retrieval remain optional follow-ups. |
| 3 | **Partly fixed.** The dead `tel:` tracking branch was removed from `site.js`. **Still needed from you:** the CV PDF header **still prints the phone number** (confirmed by rendering page 1). Re-export the CV without it. Separately, decide whether to rewrite git history; this needs a force-push and is not done. |

## Detailed findings and remedial actions

### 1. HIGH: Consecutive `user` turns break AI mode (confirmed bug)

**Where:** `assets/assistant/service.mjs:23-27`, `assets/assistant/widget.mjs:269-274`, `assistant-backend/worker.mjs:19-31`

`validateMessages` on the server requires strict `user/assistant` alternation. The client never enforces this when it builds the payload. A history that ends with an unanswered `user` message produces `[..., user, user]`, which the server rejects with HTTP 400. The client then silently falls back to local answers with the message "The AI service is unavailable."

**How it happens:** the user sends a question and leaves or reloads the page before the reply arrives. On `pagehide` the request is aborted, but the history is persisted with the trailing user message, and `sessionStorage` survives the reload. Every later question in that session then fails over to local answers until the bad pair scrolls out of the 10-message window, which takes about 5 turns. Any unexpected throw in `submit()` leaves the history in the same state.

**Reproduced:**
```
history = [welcome, {user:'Tell me about skills'}] → askAssistant('And projects?')
sent roles: ['user','user'] → 400 → mode: local, "The AI service is unavailable…"
```

**Remediation:**
- In `service.mjs`, normalise before sending: merge or drop consecutive same-role messages, for example by keeping only the last `user` in a run.
- In `widget.mjs`, when a request is aborted or throws, remove the dangling user turn or mark it `unanswered` and exclude it from history. On `restore()`, drop a trailing unanswered `user` message.
- Add a regression test covering `[user, user]` history and a restored history that ends with `user`.

### 2. HIGH: Spend exposure on the paid OpenAI endpoint

**Where:** `assistant-backend/worker.mjs:56-79`, `wrangler.toml:11-19`

- The `Origin` allowlist only stops browsers. Any script can send `Origin: https://yazan-alzaghloul.github.io`.
- Per-IP (12/min) and global (120/min) limits apply, but Cloudflare's rate-limit binding is per-location and eventually consistent. The global limit alone allows about 172,800 calls a day.
- Each call sends the whole knowledge base (about 12 KB, roughly 3–4k input tokens) plus up to 900 output tokens. A sustained attack from many IPs could run up a large bill.

**Remediation:**
1. Set a **hard monthly budget and usage limit on the OpenAI project** that holds this key (the most important step).
2. Add a daily cap in the worker, using a KV or Durable Object counter or a third rate-limit binding with a long period. Return 429 once the cap is reached.
3. Consider Cloudflare Turnstile (invisible) on first use, or a short-lived signed token issued per page load, to raise the cost of scripted abuse.
4. Cut tokens per call: send the top-k ranked records plus the mandatory `profile` and `contact` records instead of the whole corpus. The code comment already plans this.

### 3. HIGH: Phone number remains publicly retrievable

**Where:** git history (commit `8da8801` removed a `tel:` link). The remote is the public `github.com/yazan-alzaghloul/portfolio`.

Removing a value from `HEAD` does not remove it from history, so anyone can still read it in the earlier commit. The PDF CV is also published, and it could not be text-checked here because its fonts are subset-encoded.

**Remediation:**
- Decide whether the number must truly be private. If so, rewrite history with `git filter-repo` (or BFG) to strip it, force-push, and ask GitHub Support to purge cached views. Treat the number as already exposed either way.
- Open `Yazan-Alzaghloul-CV.pdf` and confirm the phone number is not in it. If it is, publish a redacted CV.
- Remove the now-dead `tel:` analytics branch in `assets/js/site.js:262`.

### 4. MEDIUM: Third-party tracking without consent

**Where:** `index.html:7-14` (gtag `G-ZSZWLDCH74`), `index.html:126-128` (Google Fonts)

GA4 and Google Fonts both send the visitor's IP to Google before any consent. EU/EEA visitors, such as recruiters, fall under GDPR and ePrivacy, and German courts have fined sites over Google Fonts. The assistant's privacy text is good, but the site has no privacy notice.

**Remediation:**
- Self-host the Geist fonts (woff2 in `assets/fonts/`) and drop both `preconnect`s.
- Either remove GA, switch to a cookieless tool (Plausible, Cloudflare Web Analytics, GoatCounter), or turn on GA Consent Mode v2 with denied defaults and a small consent banner.
- Add a short privacy note in the footer covering analytics and the assistant's use of OpenAI.

### 5. MEDIUM: Backend operability

**Where:** `wrangler.toml:9`, `wrangler.toml:21-22`, `worker.mjs:113-120`

- `OPENAI_MODEL = "gpt-6-luna"` must exist in the OpenAI project. If it doesn't, every request returns 502, and the client silently serves local answers, so nobody would notice the assistant isn't working.
- `observability.enabled = false` and the catch-all `catch {}` mean there are no logs or metrics.

**Remediation:**
- Enable Workers observability and log a **content-free** event per request: status, upstream status, latency, error class, but no message text. That keeps the privacy promise.
- Add a scheduled smoke test or uptime check against `/chat` that alerts when the response `mode !== 'ai'`.
- Check the model ID during deploy, for example with a one-off `wrangler dev` request, and document it in the README.

### 6. MEDIUM: Content hidden when JavaScript partially fails

**Where:** `index.html:19-24` adds `.js` inline. `assets/css/site.css:614` sets `.js .reveal { opacity: 0 }`. Only `site.js` adds `.is-visible`.

If `site.js` fails because of a 404, a CDN or ad-blocker issue, a CSP, or a script error before the reveal block, every section stays invisible. The progressive-enhancement promise in the file header doesn't hold in that case.

**Remediation:** have `site.js` add the class that enables hiding (for example `root.classList.add('reveal-ready')`) and scope the CSS to it, or add a CSS fallback animation such as `animation: reveal-failsafe 0s 3s forwards` that forces `opacity:1` after a timeout.

### 7. MEDIUM: Hero performance (LCP)

**Where:** `site.css:374-375`, `index.html:218-221`

- The portrait is wrapped in `.hero-enter`: `opacity: 0`, a 0.9 s animation, and a 360 ms delay. Chrome doesn't count an opacity-0 element for LCP, so LCP is pushed back by about 1.2 s on every load. `fetchpriority="high"` combined with `decoding="async"` also works against itself.
- The WebP source has only one candidate (`640w`). On 2× screens where `sizes` is 580px, browsers without AVIF get a blurry portrait.
- The `<img>` fallback is a 384 KB PNG.

**Remediation:**
- Don't fade the LCP image from 0. Animate `transform` only, or start at `opacity: .01`, or drop the delay for the portrait.
- Remove `decoding="async"` from the hero image.
- Generate cutout WebP at 480/960/1440 with alpha to match the AVIF set. Replace the PNG fallback with the 960 WebP, or with a compressed PNG produced by `pngquant` and `oxipng`.

### 8. MEDIUM: Structured data contradicts the content

**Where:** `index.html:97` (`"knowsAbout": [..., "Swift", ...]`) versus `index.html:287` ("iOS fundamentals") and `knowledge.mjs` ("not advanced Swift expertise").

The Swift claim reaches Google and LinkedIn previews through the structured data, and it contradicts what the assistant says.

**Remediation:** replace `"Swift"` with `"iOS fundamentals"` or remove it, and check the other `knowsAbout` entries against the CV.

### 9. MEDIUM: Build publishes `assets/` by default

**Where:** `scripts/build-static.mjs:7-21`

The script copies files from an allowlist, but it then copies the whole `assets/` tree minus a hard-coded denylist. Any new source photo, PSD or draft dropped into `assets/` ships automatically. The header comment ("Explicit public-file allowlist") overstates the protection.

**Remediation:** move unpublished originals to a non-published folder such as `design-sources/`, or use Git LFS, and delete the denylist. Alternatively, build the list of published assets by scanning the `src`, `srcset` and `href` references in `index.html` and the module graph, and fail the build on unreferenced files.

### 10. MEDIUM: No Content-Security-Policy

GitHub Pages can't set response headers, but a `<meta http-equiv="Content-Security-Policy">` covers most of what a CSP does. The current page has two inline scripts and one JSON-LD block, so it needs hashes or a move to external files.

**Remediation:** move the theme bootstrap and gtag init into small external files, or hash them. Then add a CSP that allows `'self'`, the GA domains (if kept), and `connect-src https://yazan-ai.yazan-alzaghloul.workers.dev`, plus `object-src 'none'; base-uri 'self'`. Do this after #6 so that a blocked script can't hide content.

### 11. LOW: `localhost` in the production CORS allowlist

**Where:** `wrangler.toml:7`

Any local page served on port 4173 can call the production worker from a browser. The README already shows how to override with `--var`.

**Remediation:** set production `ALLOWED_ORIGINS` to only `https://yazan-alzaghloul.github.io`, and put the localhost origin in `.dev.vars`.

### 12. LOW: CI coverage and supply chain

**Where:** `.github/workflows/static.yml`

- The workflow triggers only on `push` to `main`, so nothing tests PRs or branches.
- It has no HTML validation, link checking, accessibility check (axe or pa11y) or Lighthouse budget.
- Actions are referenced by tag (`@v4`, `@v5`) rather than by commit SHA.
- The worker has no deploy pipeline, so it can drift from the code that the tests check.

**Remediation:**
- Add a `pull_request` workflow that runs the tests, `html-validate`, `lychee` (link checker) and `@axe-core/cli` or Lighthouse CI against `site-dist/`.
- Pin actions to SHAs and let Dependabot update them.
- Optionally add a `wrangler deploy` job gated on `assistant-backend/**` changes, with an environment approval step.

### 13. LOW: Manual cache-busting

**Where:** `index.html:129-132` (`site.css?v=10`, `widget.mjs?v=6`, …), and the module imports (`config.mjs?v=2` and others)

Bumping these versions by hand is error-prone. Editing `knowledge.mjs` without bumping the `?v=` value inside `service.mjs` and `retrieval.mjs` serves stale data. The tests also import the modules without a query string, so the module instances differ from the browser's.

**Remediation:** have `build-static.mjs` add content hashes to the asset URLs in `site-dist` (a small regex rewrite or esbuild), and remove the `?v=` strings from the source.

### 14. LOW: Assistant UX, a11y and code polish

- `widget.mjs:193`: `welcome.replace("I'm Yazan AI", …).replace(…)` is dead code, because `config.mjs` already says "AI Assistant". Remove it.
- `widget.mjs:212` (`open()`): `input.focus()` opens the on-screen keyboard immediately on phones and hides the intro and suggestion chips. Focus the dialog or heading on coarse pointers and the input only on fine pointers.
- `widget.mjs:299-304`: the manual Tab trap duplicates the native modal `<dialog>` behaviour. It's harmless, but the selector misses `textarea`, `select` and `[tabindex]` values other than 0. Simplify or remove it.
- `site.js:146-159`: the count-up sets `textContent = '0'` and animates. Screen readers can announce "0" or intermediate values. Set `aria-hidden` on the animating `<strong>` and put the final value in the `sr-only` `<dt>` or `<dd>` text.
- The welcome nudge is shown on every new session and auto-dismisses after 8 s. Consider showing it once per visitor with `localStorage`, and wrap that access in `try`.

### 15. LOW: Knowledge base can drift from page content

**Where:** `assets/assistant/knowledge.mjs:1-7`

The knowledge is "verified 2026-10-31", but `index.html` has changed since, for example in `803331c` (Core stack) and `e975eb2` (years). Nothing detects a mismatch.

**Remediation:** add a test that loads `index.html` and checks key facts against `knowledge.mjs`: years of experience, app and company counts, the role list, project names, and contact URLs. Update `verifiedAt` as part of any content change.

### 16. LOW: Link details

- The CV links (`index.html:175`, `:203`) use absolute production URLs, so local or preview builds download the production CV. Use the relative `Yazan-Alzaghloul-CV.pdf`.
- The FH Personal and investnation links point to Play Store *search* results (`:407`, `:422`). Use the `details?id=` package URLs, as the other projects do, and add App Store links where they exist.
- The LinkedIn Learning certificate URLs (`:480`, `:484`, and the JSON-LD) carry `?u=86013394`, an organisation or licence identifier. Drop the parameter if the certificate still resolves without it.
- `rel="noreferrer"` on external links already implies `noopener`, so that's fine.

### 17. LOW: Repository hygiene

- `.DS_Store` is tracked even though `.gitignore` lists it. Run `git rm --cached .DS_Store`.
- `.impeccable/review/*.png` (about 335 KB of review screenshots) and the unused originals (`yazan-alzaghloul*.{jpg,png}`, `yazan-hero-400.webp`, `yazan-hero-enhanced-*`, about 0.8 MB) bloat the clone. Move them out, put them in LFS, or ignore them.
- Several MB of third-party design-skill tooling is vendored into `.agents/` and `.github/skills/`. `.github/hooks/impeccable.json` runs `node .github/skills/impeccable/scripts/hook.mjs` after every agent edit. This is executable third-party code in a public repo. Keep it only if it's actively used, check its provenance against `skills-lock.json` hashes, and consider moving it out of the site repo or into a git submodule.
- There's no top-level `README.md` covering how to run, build, test and deploy. The only README is `assistant-backend/README.md`.

---

## Prioritised remediation plan

| Priority | Action | Effort |
|---|---|---|
| **Now** | Set an OpenAI project budget and hard limit (#2) | 5 min |
| **Now** | Decide on and purge the phone number from history. Check the CV PDF (#3) | 30 min |
| **Now** | Fix role alternation in `service.mjs` and `widget.mjs`, and add the regression test (#1) | 1 h |
| Next | Enable worker observability with content-free logs and an AI-mode smoke check (#5) | 1 h |
| Next | Reveal failsafe (#6) and LCP fix for the portrait (#7) | 1 h |
| Next | Fix the JSON-LD Swift claim (#8) and the CV and Play Store links (#16) | 15 min |
| Next | Self-host fonts. Replace GA or gate it on consent. Add a privacy note (#4) | 2 h |
| Later | Worker daily cap, optional Turnstile, top-k retrieval (#2) | 2–4 h |
| Later | Move source images out of `assets/` and simplify the build (#9). Hashed asset URLs (#13) | 2 h |
| Later | Meta CSP (#10). Remove localhost from prod CORS (#11) | 1 h |
| Later | PR CI with validation, link, a11y and Lighthouse checks. Pin actions (#12). Knowledge drift test (#15) | 2–3 h |
| Later | Repo hygiene and top-level README (#17). UX polish (#14) | 1–2 h |
