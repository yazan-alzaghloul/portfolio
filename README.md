# Yazan Alzaghloul — Portfolio

Personal portfolio site for Yazan Alzaghloul, Engineering Manager, Senior Software Engineer and Mobile Architect.

**Live site:** https://yazan-alzaghloul.github.io/portfolio/

It's a static, framework-free site (plain HTML, CSS and JavaScript modules) hosted on GitHub Pages. It includes an AI assistant that answers visitors' questions about Yazan's experience, skills and projects.

## Features

- Single-page layout with these sections: About, Skills, Experience, Projects, Credentials and Contact
- Responsive design, light and dark themes, reduced-motion support and a print stylesheet
- Accessibility features: semantic landmarks, a skip link and ARIA on all interactive controls
- Downloadable CV ([`Yazan-Alzaghloul-CV.pdf`](Yazan-Alzaghloul-CV.pdf))
- **AI assistant** grounded in the CV:
  - Answers from a curated local knowledge base out of the box
  - Can use an optional Cloudflare Worker backend for generative answers through the OpenAI Responses API, with rate limiting and a daily request cap

## Project structure

```
index.html                 The site (single page)
assets/
  css/site.css             Site styles
  js/site.js               Site behavior
  assistant/               AI assistant widget (client side)
    widget.mjs             Accessible chat dialog and UI state
    service.mjs            Backend calls, timeout and fallback
    retrieval.mjs          Local lexical retrieval
    knowledge.mjs          Curated CV/portfolio knowledge records
    config.mjs             Public config (endpoint, limits, suggestions)
    assistant.css          Widget styles
  yazan-*.avif|webp|png    Portrait images
assistant-backend/         Cloudflare Worker for generative answers (not published to Pages)
scripts/build-static.mjs   Copies only public files into site-dist/
tests/assistant.test.mjs   Assistant tests (node --test)
.github/workflows/         GitHub Pages deploy workflow
favicon.png, og.png, sitemap.xml
```

## Run locally

You don't need a build step or any dependencies to preview the site:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open http://localhost:4173. The site and the assistant's local answers work without any credentials.

## Tests

Requires Node.js 22 or later.

```bash
node --test tests/assistant.test.mjs
```

## Deployment

Every push to `main` triggers [`.github/workflows/static.yml`](.github/workflows/static.yml), which:

1. Runs the assistant tests
2. Runs `node scripts/build-static.mjs` to stage only public files into `site-dist/`. Backend code, tests and secrets are never published.
3. Uploads `site-dist/` and deploys it to GitHub Pages

The workflow doesn't deploy the AI backend. You deploy the Worker separately with Wrangler.

## AI assistant backend

The Worker in [`assistant-backend/`](assistant-backend/) keeps the OpenAI key server-side. It also enforces:

- CORS restricted to the site's own origin
- Request size limits
- Per-IP and global rate limits
- A daily cap of 500 requests, held in a Durable Object

See [`assistant-backend/README.md`](assistant-backend/README.md) for setup, deployment, local development, and the security and privacy notes.

## Updating content

- **Site content:** edit `index.html`.
- **Assistant knowledge:** edit `assets/assistant/knowledge.mjs` and update `knowledgeMeta.verifiedAt`. The site and the Worker share these records, so redeploy both.
- **After a content change:** update `<lastmod>` in `sitemap.xml`.
