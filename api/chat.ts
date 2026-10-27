/**
 * POST /api/chat  { analysis, history, question, lang, country? }
 * Follow-up questions about the document. Nemotron decides if it needs to search the web first.
 */
import { handler, HttpError, MODELS, nemotron, nemotronJson, SearchHit, tavily, today } from './_lib.js';
import type { Analysis, ChatTurn } from './_types.js';

export default handler(async (body) => {
  const a = body.analysis as Analysis | undefined;
  const question = typeof body.question === 'string' ? body.question.slice(0, 1500) : '';
  const lang = typeof body.lang === 'string' ? body.lang : 'English';
  const country = typeof body.country === 'string' ? body.country : '';
  const history = (Array.isArray(body.history) ? (body.history as ChatTurn[]) : []).slice(-8);
  if (!a || !question.trim()) throw new HttpError(400, 'analysis and question required');

  // 1) small, fast planning step: does this need fresh info from the web?
  let hits: SearchHit[] = [];
  try {
    const plan = await nemotronJson<{ search: boolean; query: string }>(MODELS.fast, [
      {
        role: 'system',
        content:
          'detailed thinking off\nDecide whether answering the question needs current information from the web (laws, official procedures, office hours, fees, how-to). ' +
          'Reply ONLY JSON {"search":true|false,"query":"short web search"}.',
      },
      { role: 'user', content: `Document: ${a.title} from ${a.sender}.${country ? ` Country: ${country}.` : ''}\nQuestion: ${question}` },
    ], { maxTokens: 300, think: 'off' });
    if (plan.search && plan.query) hits = await tavily(plan.query, 4);
  } catch {
    hits = [];
  }

  // 2) answer with the document + sources
  const sources = hits.map((h, i) => `[${i + 1}] ${h.title} (${h.url})\n${h.content}`).join('\n\n');
  const answer = await nemotron(MODELS.text, [
    {
      role: 'system',
      content:
        `detailed thinking off\nYou are PaperPal. Answer questions about the user's document in ${lang}, briefly and concretely (max ~120 words). Today is ${today()}. ` +
        `Use the document first, then the web sources if given, and put a citation like [1] right after the sentence it supports — never pile citations at the end, cite only sources you actually used. Use short bullet points for steps. If unsure, say what to check and with whom. ` +
        `You are not a lawyer: for high-stakes legal or money questions suggest confirming with the sender or a professional.\n\nDOCUMENT:\n${JSON.stringify(a)}` +
        (sources ? `\n\nWEB SOURCES:\n${sources}` : ''),
    },
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: question },
  ], { maxTokens: 4000, temperature: 0.3 });
  return { answer, sources: hits.map((h) => ({ title: h.title, url: h.url })) };
});
