/**
 * POST /api/analyze  { images?: string[] (data URLs), text?: string, lang: string }
 * Nemotron VL reads the document and turns it into a plain-language action plan.
 */
import { handler, HttpError, MODELS, Msg, nemotronJson, today } from './_lib.js';
import type { Analysis } from './_types.js';

const SCHEMA = `{
  "title": "short name for this document, e.g. 'Tuition payment notice'",
  "docType": "letter | invoice | fine | contract | notice | form | email | other",
  "sender": "who sent it",
  "docLanguage": "language the document is written in",
  "summary": "2-4 short sentences in plain words: what this is and what it means for me",
  "ask": "one sentence: what they want me to do",
  "actions": [{ "step": "concrete action", "deadline": "YYYY-MM-DD or null", "estimated": false, "urgency": "high|medium|low", "how": "where/how, if stated" }],
  "amounts": [{ "label": "what the money is for", "value": "amount with currency" }],
  "ifIgnored": "what happens if I do nothing (only what the document says or clearly implies)",
  "keyFacts": [{ "label": "e.g. Reference number", "value": "..." }],
  "replyNeeded": true,
  "warnings": ["red flags: possible scam signs, missing info, unusual demands; empty if none"],
  "verifyQueries": ["2 short web searches (in English or the document's language) about the GENERAL official rules in that country behind this document, e.g. 'Germany Verwarnungsgeld payment deadline rules' — not about the specific sender"],
  "confidence": 0.0
}`;

export default handler(async (body) => {
  const images = Array.isArray(body.images) ? (body.images as string[]).slice(0, 3) : [];
  const text = typeof body.text === 'string' ? body.text.slice(0, 20000) : '';
  const lang = typeof body.lang === 'string' ? body.lang : 'English';
  if (!images.length && !text.trim()) throw new HttpError(400, 'Send a photo, PDF or text of the document');

  const system =
    `detailed thinking off\nYou are PaperPal, a calm, precise assistant that explains official paperwork (letters from universities, banks, ` +
    `landlords, government offices, fines, contracts) to ordinary people. Today is ${today()}. ` +
    `Read the document carefully. Never invent facts, dates or amounts: if something is not in the document, say so or use null. ` +
    `Convert every deadline to an absolute ISO date: resolve "within 14 days of this letter" from the letter's date. ` +
    `If a period runs from when the letter is RECEIVED, estimate receipt as the letter date + 3 days, compute the date, set "estimated": true ` +
    `and say in "how" that it counts from the day you received it. If no letter date exists, use today as the receipt date. ` +
    `Order actions by deadline. Write EVERY text field in ${lang}. Never leave words in another script untranslated: ` +
    `write the ${lang} translation or transliteration first and the original in parentheses, e.g. "Hanbit University (한빛대학교)". ` +
    `Keep numbers, amounts and reference codes exactly as written. "docLanguage" is the language's full name written in ${lang}. ` +
    `In "ifIgnored" list every consequence the document mentions. ` +
    `Reply with ONLY a JSON object of this shape:\n${SCHEMA}`;

  const content: Msg['content'] = [
    { type: 'text', text: text ? `Document text:\n${text}` : 'Here is the document (photo/scan). Explain it.' },
    ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ];
  const model = images.length ? MODELS.vision : MODELS.text;
  const a = await nemotronJson<Analysis>(model, [
    { role: 'system', content: system },
    { role: 'user', content },
  ], { maxTokens: 8000 });

  // defensive defaults so the UI never breaks
  return {
    analysis: {
      title: a.title || 'Document',
      docType: a.docType || 'other',
      sender: a.sender || 'Unknown sender',
      docLanguage: a.docLanguage || 'Unknown',
      summary: a.summary || '',
      ask: a.ask || '',
      actions: Array.isArray(a.actions) ? a.actions.filter((x) => x && x.step) : [],
      amounts: Array.isArray(a.amounts) ? a.amounts : [],
      ifIgnored: a.ifIgnored || '',
      keyFacts: Array.isArray(a.keyFacts) ? a.keyFacts : [],
      replyNeeded: !!a.replyNeeded,
      warnings: Array.isArray(a.warnings) ? a.warnings.filter(Boolean) : [],
      verifyQueries: Array.isArray(a.verifyQueries) ? a.verifyQueries.slice(0, 3) : [],
      confidence: typeof a.confidence === 'number' ? a.confidence : 0.7,
    } satisfies Analysis,
    model,
  };
});
