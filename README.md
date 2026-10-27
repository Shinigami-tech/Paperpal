# PaperPal — your personal AI for official paperwork

Snap a confusing letter, bill, fine or contract — in **any language** — and PaperPal:

1. **Explains it in plain words** in your language (what it is, who sent it, what they want).
2. **Turns it into a to-do list** with real deadlines, countdowns, `.ics` calendar reminders and browser notifications.
3. **Checks it against the live web** (Tavily search) — confirms the rules behind the letter and flags anything that looks off or like a scam.
4. **Drafts your reply** in the sender's language, with a translation so you know what you're signing.
5. **Answers follow-up questions** ("Can I pay in instalments?") with cited sources.
6. Keeps **My papers** — every document and its open deadlines, sorted by urgency, stored only in your browser.

Built for students abroad, immigrants, and anyone who has stared at an official letter not knowing what it wants.

## Built with NVIDIA Nemotron on Nebius Token Factory

| Step | Model (Nebius Token Factory, OpenAI-compatible API) |
| --- | --- |
| Reading photos/scans of documents | `nvidia/Nemotron-3.5-Super-VL` (vision) |
| Reasoning over the document + web sources, drafting replies | `nvidia/nemotron-3-super-120b-a12b` |
| Fast planning (does this question need a web search?) | `nvidia/Nemotron-3_5-Lightning` |

Model ids can be overridden with `PAPERPAL_VISION_MODEL`, `PAPERPAL_TEXT_MODEL`, `PAPERPAL_FAST_MODEL`.
Web search: [Tavily](https://tavily.com).

### Where Token Factory accelerated the workflow

- **One API, three models.** Token Factory is OpenAI-compatible, so switching between the vision, reasoning and fast Nemotron models is just a different `model` id — no extra SDKs, no GPU setup, no model hosting.
- **Vision replaces a whole pipeline.** `Nemotron-3.5-Super-VL` reads the photo directly (Korean, German, Russian, tables, stamps), so there is no separate OCR → translation → reasoning chain.
- **Per-call reasoning control.** `reasoning_effort: "low"` for reading documents (accurate, ~25 s) and `chat_template_kwargs.enable_thinking: false` for planning and translation (~2 s) keep the whole flow under a minute.
- **Serverless-friendly.** Calls go straight from Vercel functions to Token Factory; keys stay on the server and documents are never stored.

Code: [`api/_lib.ts`](api/_lib.ts) (model routing, reasoning control, JSON retries), [`api/analyze.ts`](api/analyze.ts), [`api/verify.ts`](api/verify.ts), [`api/reply.ts`](api/reply.ts), [`api/chat.ts`](api/chat.ts).

## Architecture

```
browser (Vite + TypeScript)            Vercel serverless functions (/api)
 ├─ photo / PDF (pdf.js) / text  ───▶  analyze  → Nemotron VL → structured JSON
 ├─ result cards, deadlines      ◀───  verify   → Tavily → Nemotron (cited checks)
 ├─ reply editor                 ───▶  reply    → Nemotron (sender's language + translation)
 ├─ chat                         ───▶  chat     → Lightning plan → Tavily → Nemotron
 └─ My papers (localStorage), .ics export, Notifications
```

API keys live only on the server. Documents are not stored server-side.

## Run locally

```bash
npm install
cp .env.example .env   # add NEBIUS_API_KEY and TAVILY_API_KEY
npm run dev            # http://localhost:5173 (the /api routes run inside Vite)
```

## Deploy

Import the repo on Vercel, add `NEBIUS_API_KEY` and `TAVILY_API_KEY` as environment variables, deploy.

## Disclaimer

PaperPal is an AI assistant, not a lawyer. The sample documents are fictional.

MIT licensed.
