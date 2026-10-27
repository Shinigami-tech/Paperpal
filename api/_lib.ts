/**
 * Shared server helpers: NVIDIA Nemotron models on Nebius Token Factory (OpenAI-compatible API)
 * and Tavily web search. API keys only ever live here, on the server.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE = process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1';

/** NVIDIA open models used by PaperPal (overridable through env vars) */
export const MODELS = {
  /** reads photos / scans of documents */
  vision: process.env.PAPERPAL_VISION_MODEL || 'nvidia/Nemotron-3.5-Super-VL',
  /** reasoning over the document + sources */
  text: process.env.PAPERPAL_TEXT_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
  /** quick small steps (planning searches) */
  fast: process.env.PAPERPAL_FAST_MODEL || 'nvidia/Nemotron-3_5-Lightning',
};

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export interface Msg {
  role: 'system' | 'user' | 'assistant';
  content: string | Part[];
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** One chat completion against Nebius Token Factory. Returns the assistant text. */
/** 'off' = no reasoning (fastest), 'low' = short reasoning (good accuracy, still quick), 'full' = model default */
export type Think = 'off' | 'low' | 'full';
interface Opts {
  maxTokens?: number;
  temperature?: number;
  think?: Think;
}

export async function nemotron(model: string, messages: Msg[], opts: Opts = {}) {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new HttpError(500, 'Server is missing NEBIUS_API_KEY');
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 6000,
      temperature: opts.temperature ?? 0.2,
      ...(opts.think === 'off' ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      ...(opts.think === 'low' || opts.think === undefined ? { reasoning_effort: 'low' } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new HttpError(502, `Nebius ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string | null; reasoning_content?: string } }[];
    usage?: { completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  let text = choice?.message?.content ?? '';
  if (!text.trim()) console.warn(`[nemotron] empty content from ${model}, finish=${choice?.finish_reason}, tokens=${data.usage?.completion_tokens}`);
  // reasoning models may wrap their thoughts in <think> tags
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return text;
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences and chatter). */
export function parseJson<T>(text: string): T {
  const clean = text.replace(/```(?:json)?/gi, '').trim();
  const start = clean.indexOf('{');
  if (start < 0) throw new HttpError(502, 'Model did not return JSON');
  // scan for the matching closing brace
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const slice = clean.slice(start, i + 1);
        try {
          return JSON.parse(slice) as T;
        } catch {
          // common slip: trailing commas
          return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1')) as T;
        }
      }
    }
  }
  throw new HttpError(502, 'Model returned incomplete JSON');
}

/** Ask for JSON; retry once with a stricter nudge if parsing fails. */
export async function nemotronJson<T>(model: string, messages: Msg[], opts: Opts = {}): Promise<T> {
  const first = await nemotron(model, messages, opts);
  try {
    return parseJson<T>(first);
  } catch {
    console.warn(`[nemotron] unparsable JSON from ${model}: ${first.slice(0, 300)} … ${first.slice(-200)}`);
    const second = await nemotron(
      model,
      [...messages, { role: 'assistant', content: first }, { role: 'user', content: 'Return ONLY the JSON object, valid and complete, nothing else.' }],
      opts,
    );
    try {
      return parseJson<T>(second);
    } catch {
      // last resort: no reasoning at all — fastest and most format-obedient
      return parseJson<T>(await nemotron(model, messages, { ...opts, think: 'off' }));
    }
  }
}

export interface SearchHit {
  title: string;
  url: string;
  content: string;
}

/** Tavily web search (advanced depth, short answers). */
export async function tavily(query: string, maxResults = 4): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: 'advanced', max_results: maxResults, include_answer: false }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, content: (r.content || '').slice(0, 1200) }));
}

/** Wrap a handler with JSON parsing, method check and error reporting. */
export function handler(fn: (body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }
    try {
      const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
      const out = await fn(body as Record<string, unknown>);
      res.status(200).json(out);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      console.error(e);
      res.status(status).json({ error: e instanceof Error ? e.message : String(e) });
    }
  };
}

export const today = () => new Date().toISOString().slice(0, 10);
