# AI Assistant: configuration and deployment

The portfolio stays on GitHub Pages. The optional AI service runs separately as a Cloudflare Worker. No frontend API keys, packages, or build framework are required.

## Current behavior

The widget is installed through two tags in `index.html`. It works immediately with a local, curated CV/portfolio knowledge base and simple lexical retrieval with short follow-up context. It honestly labels these as **Local answers**. This fallback is not a generative language model.

The complete generative AI path is implemented, but is disabled until you deploy the Worker, select a model, store your OpenAI key, and set the public endpoint. No paid provider calls were made during implementation.

## Enable generative AI

Requirements: Node.js 22+, a Cloudflare Workers account, and an OpenAI project with API access and billing. Use a current official Wrangler release (the rate-limit API requires Wrangler 4.36+).

1. In `assistant-backend/wrangler.toml`, set `OPENAI_MODEL` to a model your OpenAI project can access that supports the Responses API and structured JSON output. It is intentionally blank rather than assuming model access. Keep `ALLOWED_ORIGINS` set to `https://yazan-alzaghloul.github.io` (origins do not contain `/portfolio/`). For a custom domain, add its exact origin, separated by a comma.
2. From the repository root, authenticate and store the key **in Cloudflare's server-side secret store**:

   ```sh
   npx wrangler@4 login
   npx wrangler@4 secret put OPENAI_API_KEY --config assistant-backend/wrangler.toml
   ```

   Enter the key at Wrangler's hidden prompt. Never put it in `config.mjs`, HTML, GitHub Pages configuration, a commit, or a public environment variable. On an initial setup, Wrangler may ask to create the named Worker before storing its secret.
3. Deploy the Worker:

   ```sh
   npx wrangler@4 deploy --config assistant-backend/wrangler.toml
   ```

4. Set `endpoint` in `assets/assistant/config.mjs` to the returned Worker URL with `/chat`, for example `https://yazan-ai.your-subdomain.workers.dev/chat`. This URL is public configuration, not a secret.
5. Commit and push the reviewed portfolio changes to `main` using your normal release process. The existing Pages workflow now tests the assistant and stages only public files into `site-dist/` before uploading. It does not deploy the Worker. Ensure the existing portrait assets in your working directory are tracked before releasing.
6. Open the published portfolio and ask a question. A successful model response changes the label to **Powered by AI · CV grounded**. If the service is unavailable, misconfigured, rate limited or times out, the answer uses local records and displays a fallback notice.

### Local preview

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Visit `http://localhost:4173`. The full UI and local replies work without credentials. For local Worker development, create an ignored `assistant-backend/.dev.vars` with `OPENAI_API_KEY` and `OPENAI_MODEL`; never commit it. Run:

```sh
npx wrangler@4 dev --config assistant-backend/wrangler.toml --var ALLOWED_ORIGINS:http://localhost:4173
```

Temporarily use `http://localhost:8787/chat` as the frontend endpoint. Restore the production endpoint and origin before releasing. Real AI replies incur provider usage. Do not rely on local development to verify distributed production rate limits.

## Modules and data flow

- `assets/assistant/widget.mjs`: native accessible dialog, focus containment, launcher, session history, welcome, suggestions, timestamps, pending/reset handling, UI state.
- `assets/assistant/assistant.css`: existing theme tokens, glass surfaces, desktop/mobile layout, restrained motion, reduced-motion support.
- `assets/assistant/config.mjs`: public endpoint, input/history bounds, welcome and suggestions.
- `assets/assistant/knowledge.mjs`: dated, individually identified reference records; source metadata, verified facts and explicitly unknown details.
- `assets/assistant/retrieval.mjs`: lexical retrieval and honest local excerpts; short follow-ups refer to the prior user topic.
- `assets/assistant/service.mjs`: bounded transcript, timeout/cancellation, response validation, source URL allowlist and fallback.
- `assistant-backend/worker.mjs`: CORS, request/body limits, platform rate limiting, grounded prompt, Responses API, structured output and server-owned citations.

Browser → POST `{messages: [{role, content}, ...]}` → Worker → server-owned retrieval/reference records → OpenAI Responses API → `{text, sources: [{title, url}], mode: "ai"}`.

The browser never sends knowledge, credentials or system instructions. The server accepts only alternating user/assistant roles, ending with user, with at most 11 messages and 12,000 content characters. Individual user messages are capped at 1,000 characters; request bodies at 16,000 bytes. The browser history keeps at most 40 messages in `sessionStorage` and clears on New conversation. Close and Minimize retain history and ongoing replies. Reload restores completed messages. Drafts are not persisted.

## Knowledge maintenance and future RAG

The current records were checked against `index.html` and `Yazan-Alzaghloul-CV.pdf` on 2026-10-31. Certificates are sourced from the portfolio. The portfolio's availability banner is quoted as a dated statement; actual calendar, notice period and hiring terms remain unconfirmed. GitHub source repositories are not inferred from the Pages URL. No external pages, calendar or private employer systems are queried.

When the CV changes, edit the affected records, maintain stable IDs/source URLs, and update `knowledgeMeta.verifiedAt`. Keep only information intended for public visitors. Both local answers and the Worker import the same records, so redeploy **both** when knowledge changes. The CV itself is not automatically reparsed at runtime.

For future RAG, replace the Worker's `retrieve()` adapter with server-side embedding/vector search. Return records with the same `{id, title, text, source, url}` contract, keep profile/contact/unknown-availability facts available, and preserve the frontend response envelope. This small initial corpus fits in the model context; the Worker currently prioritizes retrieval matches then includes the remaining verified records to support multi-part questions. At larger scale, use top-k records and constrain output source IDs/URLs to the server-retrieved set. The UI does not need to change.

## Security and privacy boundaries

- Worker secrets stay server-side; missing credentials, model or rate-limit bindings fail closed. The browser falls back to public local records.
- Exact CORS allowlist, no cookies/credentials, JSON-only POST, bounded body reads, validated roles/lengths and generic provider errors.
- Cloudflare rate-limit bindings allow 12 requests per IP/minute and 120 requests/minute for the service key. Namespace IDs must be unique within your account if you want isolated counters. These counters are local to Cloudflare locations and eventually consistent; they are **not** a strict global budget or authentication. CORS can also be imitated by non-browser clients. Set provider project budgets/alerts; use Cloudflare WAF/Turnstile or a durable centralized quota if abuse requires stricter enforcement.
- No tools, browsing, calendar access, or arbitrary URL fetching are exposed to the model. Knowledge and prior messages are explicitly treated as untrusted reference data. Structured output restricts source IDs to the known corpus; the server constructs source URLs. Browser rendering uses `textContent` and an exact source URL allowlist, never model HTML/Markdown.
- Prompt instructions reduce injection and hallucination risk; they cannot guarantee factual correctness. Evaluate adversarial and unsupported questions before public release, and review answers after knowledge/model changes.
- The widget adds no analytics events and sends no chat text to the site's existing analytics. Existing site-wide analytics remain in place. Session history remains in the browser; the Worker code does not log conversations and Worker observability is disabled in the supplied config.
- When enabled, bounded recent conversation text and public reference records go to OpenAI. `store: false` disables Responses application storage; this does not promise zero provider retention or override account data controls. Hosting/provider operational metadata may still be retained. Avoid requesting personal information.

## Verification

```sh
node --test tests/assistant.test.mjs
node scripts/build-static.mjs
```

Tests cover all starters, short follow-ups, unsupported questions, unknown availability, injection redirects, source URL filtering, cancellation, service errors, transcript limits, role injection, CORS, individual/global throttling, body bounds, provider payload construction, structured citations and error redaction. Provider tests use mocked responses and make no paid API calls.

Manual release checks: open/close/minimize/Escape; keyboard focus containment and return; blank input and Enter; suggestions and follow-ups; New conversation during an in-flight request; reload/session restoration; source links; dark/light themes; mobile portrait/landscape and on-screen keyboard; reduced motion; network failure, timeout, 429 and malformed provider output. Validate at least one actual AI reply after configuring credentials.

Official references: [Responses API migration and storage](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Cloudflare rate-limit bindings and limitations](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
