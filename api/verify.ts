/**
 * POST /api/verify  { analysis, lang, country? }
 * Tavily searches official sources, Nemotron checks the document's claims against them.
 */
import { handler, HttpError, MODELS, nemotronJson, SearchHit, tavily, today } from './_lib.js';
import type { Analysis, Verification } from './_types.js';

export default handler(async (body) => {
  const a = body.analysis as Analysis | undefined;
  const lang = typeof body.lang === 'string' ? body.lang : 'English';
  const country = typeof body.country === 'string' ? body.country : '';
  if (!a) throw new HttpError(400, 'analysis required');
  const queries = (a.verifyQueries?.length ? a.verifyQueries : [`${a.sender} ${a.title}`]).slice(0, 2).map((q) => (country ? `${q} ${country}` : q));
  const results = await Promise.all(queries.map((q) => tavily(q, 4)));
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const r of results.flat()) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    hits.push(r);
  }
  if (!hits.length) return { verification: { checks: [], tip: 'No web sources found to double-check this document.' } satisfies Verification, queries };

  const sources = hits.slice(0, 7).map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.content}`).join('\n\n');
  const v = await nemotronJson<{ checks: { claim: string; status: string; note: string; sources: number[] }[]; tip: string }>(MODELS.text, [
    {
      role: 'system',
      content:
        `detailed thinking off\nYou fact-check official paperwork against web sources. Today is ${today()}. ` +
        `Compare the key requirements, deadlines, fees and procedures of the document with the sources. ` +
        `Only mark "confirmed" or "differs" when a source clearly supports it; otherwise "unclear". Prefer official sites. ` +
        `Write "claim", "note" and "tip" in ${lang} — not in English unless ${lang} is English. Reply with ONLY JSON: {"checks":[{"claim":"...","status":"confirmed|differs|unclear","note":"...","sources":[1,2]}],"tip":"one practical tip from the sources"}. Max 4 checks.`,
    },
    { role: 'user', content: `DOCUMENT ANALYSIS:\n${JSON.stringify(a)}\n\nSOURCES:\n${sources}\n\nWrite every claim, note and the tip in ${lang}.` },
  ], { maxTokens: 6000 });

  const verification: Verification = {
    checks: (v.checks || []).slice(0, 4).map((c) => ({
      claim: c.claim,
      status: (['confirmed', 'differs', 'unclear'].includes(c.status) ? c.status : 'unclear') as 'confirmed' | 'differs' | 'unclear',
      note: c.note,
      sources: (c.sources || [])
        .map((n) => hits[n - 1])
        .filter(Boolean)
        .map((h) => ({ title: h.title, url: h.url })),
    })),
    tip: v.tip || '',
  };
  return { verification, queries };
});
