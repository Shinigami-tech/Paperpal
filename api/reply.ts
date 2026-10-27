/**
 * POST /api/reply  { analysis, lang, notes?, tone? }
 * Drafts a reply in the document's language, plus a translation for the user.
 */
import { handler, HttpError, MODELS, nemotronJson, today } from './_lib.js';
import type { Analysis, Reply } from './_types.js';

export default handler(async (body) => {
  const a = body.analysis as Analysis | undefined;
  if (!a) throw new HttpError(400, 'analysis required');
  const lang = typeof body.lang === 'string' ? body.lang : 'English';
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : '';
  const tone = typeof body.tone === 'string' ? body.tone : 'polite and formal';
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : '[Your name]';
  const r = await nemotronJson<Reply>(MODELS.text, [
    {
      role: 'system',
      content:
        `detailed thinking off\nYou write short, ${tone} replies to official letters. Today is ${today()}. ` +
        `Write the reply in ${a.docLanguage || 'the language of the document'}, quote the reference numbers from the document, ` +
        `do not promise anything the user did not say, and use [brackets] ONLY for missing personal details (address, date of birth, bank details) — never around facts the user gave you. The subject and body must be in the SAME language the sender wrote in (a German letter gets a German reply, a Korean letter a Korean reply), even if the analysis below is written in another language. Sign as ${name}. ` +
        `Then translate the reply into ${lang}. Reply with ONLY JSON: {"subject":"...","body":"...","translation":"..."}`,
    },
    { role: 'user', content: `DOCUMENT:\n${JSON.stringify(a)}\n\nWHAT I WANT TO SAY (may be empty):\n${notes}\n\nRemember: subject + body in the sender's language (${a.docLanguage}); only "translation" in ${lang}.` },
  ], { maxTokens: 6000 });
  return { reply: { subject: r.subject || '', body: r.body || '', translation: r.translation || '' } satisfies Reply };
});
