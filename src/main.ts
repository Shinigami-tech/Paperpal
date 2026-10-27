import './styles.css';
import type { Analysis, Reply, Verification } from '../api/_types';
import { prepare, scaleCanvas, type Prepared } from './files';
import { daysLeft, loadDocs, loadPrefs, saveDocs, savePrefs, type SavedDoc, type Source } from './store';
import { deadlinesIcs, download } from './ics';
import { SAMPLES } from './samples';

/* ------------------------------------------------------------------ state */

let docs = loadDocs();
let prefs = loadPrefs();
let loadingStep = 0;
let loadingThumb = '';
let loadingTimer = 0;
let busy: Record<string, boolean> = {};
let flash = '';
let showSettings = false;
let pasteOpen = false;
let confirmDelete = '';
let replyOpts = { tone: 'polite and formal', notes: '' };
let showTranslation = true;

const LANGS: [string, string][] = [
  ['English', 'English'],
  ['Russian', 'Русский'],
  ['Kazakh', 'Қазақша'],
  ['Spanish', 'Español'],
  ['French', 'Français'],
  ['German', 'Deutsch'],
  ['Portuguese', 'Português'],
  ['Ukrainian', 'Українська'],
  ['Turkish', 'Türkçe'],
  ['Arabic', 'العربية'],
  ['Hindi', 'हिन्दी'],
  ['Chinese', '中文'],
  ['Korean', '한국어'],
  ['Japanese', '日本語'],
  ['Vietnamese', 'Tiếng Việt'],
  ['Indonesian', 'Bahasa Indonesia'],
];

const app = document.getElementById('app')!;

/* ---------------------------------------------------------------- helpers */

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** tiny, safe markdown: **bold**, bullet lines, [n] citations, line breaks */
function md(text: string, sources: Source[] = []) {
  const lines = esc(text).split(/\n/);
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const m = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (m) {
      if (!inList) html += '<ul>';
      inList = true;
      html += `<li>${m[1]}</li>`;
    } else {
      if (inList) html += '</ul>';
      inList = false;
      if (line.trim()) html += `<p>${line}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html.replace(/\[(\d{1,2})\]/g, (all, n) => {
    const s = sources[Number(n) - 1];
    return s ? `<a class="cite" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">${n}</a>` : all;
  });
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function dueLabel(iso: string | null) {
  const d = daysLeft(iso);
  if (d === null) return { text: 'No deadline', cls: 'none' };
  if (d < 0) return { text: `${-d} day${d === -1 ? '' : 's'} overdue`, cls: 'over' };
  if (d === 0) return { text: 'Due today', cls: 'over' };
  if (d === 1) return { text: 'Due tomorrow', cls: 'hot' };
  if (d <= 3) return { text: `In ${d} days`, cls: 'hot' };
  if (d <= 10) return { text: `In ${d} days`, cls: 'warm' };
  return { text: `In ${d} days`, cls: 'calm' };
}

function niceDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** next open deadline of a document */
function nextDue(doc: SavedDoc) {
  let best: string | null = null;
  doc.analysis.actions.forEach((a, i) => {
    if (doc.done[i] || !a.deadline) return;
    if (!best || a.deadline < best) best = a.deadline;
  });
  return best as string | null;
}

async function api<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server error (${res.status})`);
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || `Server error (${res.status})`);
  return data as T;
}

function toast(msg: string) {
  flash = msg;
  render();
  setTimeout(() => {
    if (flash === msg) {
      flash = '';
      render();
    }
  }, 3200);
}

const persist = () => saveDocs(docs);
const route = () => location.hash.replace(/^#\/?/, '');
const go = (r: string) => {
  location.hash = '#/' + r;
};
const currentDoc = () => {
  const m = route().match(/^doc\/(.+)$/);
  return m ? docs.find((d) => d.id === m[1]) ?? null : null;
};

/* ---------------------------------------------------------------- actions */

async function thumbFrom(dataUrl: string) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return scaleCanvas(img, img.naturalWidth, img.naturalHeight, 360).toDataURL('image/jpeg', 0.7);
}

async function analyze(p: Prepared) {
  if (!p.images.length && p.text.trim().length < 20) {
    toast('That looks empty — try a clearer photo or paste more text.');
    return;
  }
  loadingThumb = p.thumb || (p.images[0] ? await thumbFrom(p.images[0]) : '');
  loadingStep = 0;
  go('reading');
  clearInterval(loadingTimer);
  loadingTimer = window.setInterval(() => {
    if (loadingStep < 3) {
      loadingStep++;
      render();
    }
  }, 2600);
  try {
    const { analysis } = await api<{ analysis: Analysis }>('analyze', { images: p.images, text: p.text, lang: prefs.lang });
    const doc: SavedDoc = {
      id: Math.random().toString(36).slice(2, 10),
      created: Date.now(),
      thumb: loadingThumb,
      analysis,
      chat: [],
      done: analysis.actions.map(() => false),
    };
    docs.unshift(doc);
    persist();
    clearInterval(loadingTimer);
    go('doc/' + doc.id);
    verify(doc);
  } catch (e) {
    clearInterval(loadingTimer);
    go('');
    toast(`Couldn't read it: ${(e as Error).message}`);
  }
}

async function verify(doc: SavedDoc) {
  busy['verify' + doc.id] = true;
  render();
  try {
    const { verification } = await api<{ verification: Verification }>('verify', {
      analysis: doc.analysis,
      lang: prefs.lang,
      country: prefs.country,
    });
    doc.verification = verification;
    persist();
  } catch (e) {
    doc.verification = { checks: [], tip: `Couldn't check sources right now (${(e as Error).message}).` };
  }
  busy['verify' + doc.id] = false;
  render();
}

async function draftReply(doc: SavedDoc) {
  busy.reply = true;
  render();
  try {
    const { reply } = await api<{ reply: Reply }>('reply', {
      analysis: doc.analysis,
      lang: prefs.lang,
      notes: replyOpts.notes,
      tone: replyOpts.tone,
      name: prefs.name,
    });
    doc.reply = reply;
    persist();
  } catch (e) {
    toast(`Couldn't draft a reply: ${(e as Error).message}`);
  }
  busy.reply = false;
  render();
}

async function ask(doc: SavedDoc, question: string) {
  question = question.trim();
  if (!question || busy.chat) return;
  const history = doc.chat.map(({ role, content }) => ({ role, content }));
  doc.chat.push({ role: 'user', content: question });
  busy.chat = true;
  render();
  scrollChat();
  try {
    const { answer, sources } = await api<{ answer: string; sources: Source[] }>('chat', {
      analysis: doc.analysis,
      question,
      lang: prefs.lang,
      country: prefs.country,
      history,
    });
    doc.chat.push({ role: 'assistant', content: answer, sources });
    persist();
  } catch (e) {
    doc.chat.push({ role: 'assistant', content: `Sorry — I couldn't answer that (${(e as Error).message}).` });
  }
  busy.chat = false;
  render();
  scrollChat();
  (document.getElementById('chat-input') as HTMLInputElement | null)?.focus();
}

function scrollChat() {
  const box = document.getElementById('chat-log');
  if (box) box.scrollTop = box.scrollHeight;
}

async function handleFiles(files: FileList | File[] | null) {
  const file = files && files[0];
  if (!file) return;
  try {
    const p = await prepare(file);
    // extra images/pages: merge up to 3 files
    for (const extra of Array.from(files).slice(1, 3)) {
      const q = await prepare(extra);
      p.images.push(...q.images);
      p.text += q.text ? '\n\n' + q.text : '';
    }
    p.images = p.images.slice(0, 3);
    await analyze(p);
  } catch (e) {
    toast(`Couldn't open that file: ${(e as Error).message}`);
  }
}

async function runSample(id: string) {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) return;
  const img = s.draw();
  await analyze({ images: [img], text: '', thumb: await thumbFrom(img) });
}

/** browser reminders for deadlines in the next 3 days (once a day per document) */
function remindDue() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;
  for (const d of docs) {
    const due = nextDue(d);
    const left = daysLeft(due);
    if (left === null || left > 3 || d.notified === today) continue;
    new Notification(`PaperPal: ${d.analysis.title}`, {
      body: left < 0 ? 'A deadline has passed — open PaperPal to see what to do.' : `${dueLabel(due).text} — ${d.analysis.actions.find((a) => a.deadline === due)?.step ?? ''}`,
      icon: '/favicon.svg',
    });
    d.notified = today;
    changed = true;
  }
  if (changed) persist();
}

/* ---------------------------------------------------------------- views */

function header() {
  const r = route();
  const open = docs.filter((d) => nextDue(d)).length;
  return `
  <header class="top">
    <a class="brand" href="#/"><img src="/favicon.svg" alt="" /> <span>PaperPal</span></a>
    <nav>
      <a href="#/" class="${r === '' ? 'on' : ''}">New paper</a>
      <a href="#/papers" class="${r === 'papers' ? 'on' : ''}">My papers${open ? ` <i class="pill">${open}</i>` : ''}</a>
      <button class="lang" data-act="settings" title="Language & profile">${esc(LANGS.find((l) => l[0] === prefs.lang)?.[1] ?? prefs.lang)} <span>⚙</span></button>
    </nav>
  </header>`;
}

function homeView() {
  const soon = docs
    .map((d) => ({ d, due: nextDue(d) }))
    .filter((x) => x.due && (daysLeft(x.due) ?? 99) <= 7)
    .sort((a, b) => (a.due! < b.due! ? -1 : 1))
    .slice(0, 3);
  return `
  <main class="home">
    <section class="hero">
      <p class="eyebrow">Your personal AI for official paperwork</p>
      <h1>Any official letter,<br/><em>explained in plain words.</em></h1>
      <p class="lede">Snap a bill, fine, contract or letter from the university — in any language. PaperPal tells you what it means, what to do and by when, checks official sources and writes your reply.</p>
    </section>

    ${
      soon.length
        ? `<section class="soon">${soon
            .map(({ d, due }) => {
              const l = dueLabel(due);
              return `<a class="soon-item" href="#/doc/${d.id}"><span class="due ${l.cls}">${l.text}</span><b>${esc(d.analysis.title)}</b><span class="muted">${esc(d.analysis.actions.find((a) => a.deadline === due)?.step ?? '')}</span></a>`;
            })
            .join('')}</section>`
        : ''
    }

    <section class="drop" id="drop">
      <div class="drop-art" aria-hidden="true">
        <div class="paper p1"></div><div class="paper p2"></div><div class="paper p3"><i></i><i></i><i></i><i></i><b></b></div>
      </div>
      <h2>Drop a document here</h2>
      <p class="muted">Photo, screenshot or PDF · up to 3 pages · nothing is stored on our servers</p>
      <div class="drop-btns">
        <label class="btn primary"><input type="file" id="file-cam" accept="image/*" capture="environment" hidden /> 📷 Take a photo</label>
        <label class="btn"><input type="file" id="file-up" accept="image/*,application/pdf,.txt,.eml" multiple hidden /> ⬆ Upload file</label>
        <button class="btn ghost" data-act="paste">✎ Paste text</button>
      </div>
      ${
        pasteOpen
          ? `<div class="paste"><textarea id="paste-text" rows="7" placeholder="Paste the text of an email or letter…"></textarea><button class="btn primary" data-act="paste-go">Explain this</button></div>`
          : ''
      }
    </section>

    <section class="samples">
      <h3>No document at hand? Try a sample <span class="muted">(fictional)</span></h3>
      <div class="sample-row">
        ${SAMPLES.map(
          (s) => `<button class="sample" data-act="sample" data-id="${s.id}"><span class="flag">${s.flag}</span><b>${esc(s.label)}</b><span class="muted">${esc(s.hint)}</span><span class="go">Explain in ${esc(prefs.lang)} →</span></button>`,
        ).join('')}
      </div>
    </section>

    <section class="how">
      <div><span class="num">1</span><h4>Understand</h4><p>Nemotron vision reads the page — stamps, tables, tiny print — and explains it in your language.</p></div>
      <div><span class="num">2</span><h4>Act</h4><p>Clear steps with real deadlines, countdowns and calendar reminders so nothing slips.</p></div>
      <div><span class="num">3</span><h4>Verify & reply</h4><p>Live web search checks the rules behind the letter, then PaperPal drafts your answer in the sender's language.</p></div>
    </section>
  </main>`;
}

function readingView() {
  const steps = [
    'Reading the page with Nemotron vision',
    `Explaining it in ${prefs.lang}`,
    'Finding actions, deadlines and amounts',
    'Looking for red flags',
  ];
  return `
  <main class="reading">
    <div class="scan">${loadingThumb ? `<img src="${loadingThumb}" alt="" />` : '<div class="scan-blank"></div>'}<div class="beam"></div></div>
    <ol class="steps">
      ${steps.map((s, i) => `<li class="${i < loadingStep ? 'done' : i === loadingStep ? 'now' : ''}"><span class="dot"></span>${esc(s)}</li>`).join('')}
    </ol>
    <p class="muted small">Usually 10–30 seconds.</p>
  </main>`;
}

function verifyCard(doc: SavedDoc) {
  const v = doc.verification;
  const loading = busy['verify' + doc.id];
  const icon = { confirmed: '✓', differs: '!', unclear: '?' } as const;
  return `
  <section class="card verify">
    <div class="card-h"><h3>Checked against the web</h3>${loading ? '<span class="spin"></span>' : `<button class="link" data-act="reverify">Re-check</button>`}</div>
    ${
      loading && !v
        ? `<p class="muted">Searching official sources for the rules behind this letter…</p><div class="skeleton"></div><div class="skeleton short"></div>`
        : v
          ? `${
              v.checks.length
                ? `<ul class="checks">${v.checks
                    .map(
                      (c) => `<li class="${c.status}">
                <span class="ck">${icon[c.status] ?? '?'}</span>
                <div><b>${esc(c.claim)}</b><p>${esc(c.note)}</p>
                ${c.sources?.length ? `<div class="srcs">${c.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(host(s.url))}</a>`).join('')}</div>` : ''}</div></li>`,
                    )
                    .join('')}</ul>`
                : ''
            }${v.tip ? `<p class="tip">💡 ${esc(v.tip)}</p>` : ''}`
          : '<p class="muted">Not checked yet.</p>'
    }
  </section>`;
}

function replyCard(doc: SavedDoc) {
  const a = doc.analysis;
  const r = doc.reply;
  return `
  <section class="card reply">
    <div class="card-h"><h3>Your reply</h3>${a.replyNeeded ? '<span class="tag hot">Reply expected</span>' : '<span class="tag">Optional</span>'}</div>
    <div class="reply-form">
      <select id="tone">
        ${['polite and formal', 'firm — I disagree', 'asking for more time', 'asking for a payment plan', 'asking for clarification'].map((t) => `<option ${t === replyOpts.tone ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <input id="notes" placeholder="Anything to add? e.g. “I was at the hospital that day”" value="${esc(replyOpts.notes)}" />
      <button class="btn primary" data-act="reply" ${busy.reply ? 'disabled' : ''}>${busy.reply ? 'Writing…' : r ? 'Rewrite' : `Draft in ${esc(a.docLanguage)}`}</button>
    </div>
    ${
      r
        ? `<div class="letter">
        ${r.subject ? `<div class="subj"><span class="muted">Subject</span> ${esc(r.subject)}</div>` : ''}
        <pre>${esc(r.body)}</pre>
        <div class="letter-btns"><button class="btn small" data-act="copy-reply">Copy</button>${
          r.translation ? `<button class="btn small ghost" data-act="toggle-tr">${showTranslation ? 'Hide' : 'Show'} ${esc(prefs.lang)} version</button>` : ''
        }${prefs.name ? '' : `<span class="muted small">Tip: add your name in ⚙ to sign letters.</span>`}</div>
        ${r.translation && showTranslation ? `<div class="tr"><span class="muted small">What it says, in ${esc(prefs.lang)}</span><pre>${esc(r.translation)}</pre></div>` : ''}
      </div>`
        : ''
    }
  </section>`;
}

function chatCard(doc: SavedDoc) {
  const suggestions = [
    'Can I pay in instalments?',
    'What if I miss the deadline?',
    'Is this legit or a scam?',
    'Who can help me with this for free?',
  ];
  return `
  <section class="card chat">
    <div class="card-h"><h3>Ask anything about it</h3><span class="muted small">Searches the web when needed</span></div>
    <div class="chat-log" id="chat-log">
      ${
        doc.chat.length
          ? doc.chat
              .map(
                (m) => `<div class="msg ${m.role}">${m.role === 'assistant' ? md(m.content, m.sources) : esc(m.content)}${
                  m.sources?.length ? `<div class="srcs">${m.sources.map((s, i) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${i + 1}. ${esc(host(s.url))}</a>`).join('')}</div>` : ''
                }</div>`,
              )
              .join('')
          : `<div class="suggest">${suggestions.map((s) => `<button class="chip" data-act="suggest">${esc(s)}</button>`).join('')}</div>`
      }
      ${busy.chat ? '<div class="msg assistant typing"><i></i><i></i><i></i></div>' : ''}
    </div>
    <form class="chat-in" data-form="chat"><input id="chat-input" autocomplete="off" placeholder="Type a question in any language…" /><button class="btn primary" ${busy.chat ? 'disabled' : ''}>Ask</button></form>
  </section>`;
}

function docView(doc: SavedDoc) {
  const a = doc.analysis;
  const doneCount = doc.done.filter(Boolean).length;
  const hasDates = a.actions.some((x) => x.deadline);
  const conf = Math.round((a.confidence ?? 0.8) * 100);
  return `
  <main class="doc">
      <div class="doc-h">
        <a class="back" href="#/papers">← My papers</a>
        <h1>${esc(a.title)}</h1>
      </div>
    <aside class="side">
      ${doc.thumb ? `<img class="thumb" src="${doc.thumb}" alt="Document" />` : '<div class="thumb text">📝</div>'}
      <div class="meta">
        <div><span class="muted">From</span><b>${esc(a.sender)}</b></div>
        <div><span class="muted">Type</span><b>${esc(a.docType)}</b></div>
        <div><span class="muted">Written in</span><b>${esc(a.docLanguage)}</b></div>
        <div><span class="muted">Read confidence</span><b><span class="bar"><i style="width:${conf}%"></i></span> ${conf}%</b></div>
      </div>
      ${
        a.keyFacts.length
          ? `<div class="facts"><h4>Keep these handy</h4>${a.keyFacts
              .map((f) => `<button class="fact" data-act="copy" data-v="${esc(f.value)}" title="Copy"><span class="muted">${esc(f.label)}</span><b>${esc(f.value)}</b></button>`)
              .join('')}</div>`
          : ''
      }
    </aside>

    <div class="main-col">

      ${a.warnings.length ? `<section class="warn">${a.warnings.map((w) => `<p>⚠ ${esc(w)}</p>`).join('')}</section>` : ''}

      <section class="card summary">
        <h3>In plain words</h3>
        <p class="big">${esc(a.summary)}</p>
        ${a.ask ? `<div class="ask"><span>What they want from you</span><p>${esc(a.ask)}</p></div>` : ''}
      </section>

      <section class="card actions">
        <div class="card-h"><h3>What to do</h3><span class="muted small">${doneCount}/${a.actions.length} done</span></div>
        <ul class="todo">
          ${a.actions
            .map((x, i) => {
              const l = dueLabel(x.deadline);
              return `<li class="${doc.done[i] ? 'checked' : ''}">
              <label><input type="checkbox" data-act="toggle" data-i="${i}" ${doc.done[i] ? 'checked' : ''} /><span class="box"></span></label>
              <div class="step"><b>${esc(x.step)}</b>${x.how ? `<p class="muted">${esc(x.how)}</p>` : ''}</div>
              <div class="when">${x.deadline ? `<span class="due ${doc.done[i] ? 'none' : l.cls}">${doc.done[i] ? 'Done' : l.text}</span><span class="muted small">${x.estimated ? '≈ ' : ''}${esc(niceDate(x.deadline))}${x.estimated ? ' (estimated)' : ''}</span>` : `<span class="urg ${x.urgency}">${x.urgency}</span>`}</div>
            </li>`;
            })
            .join('')}
        </ul>
        ${
          hasDates
            ? `<div class="row-btns"><button class="btn small" data-act="ics">📅 Add deadlines to calendar</button><button class="btn small ghost" data-act="notify">🔔 Browser reminders</button></div>`
            : ''
        }
      </section>

      <div class="two">
        ${
          a.amounts.length
            ? `<section class="card money"><h3>Money</h3>${a.amounts.map((m) => `<div class="amt"><span>${esc(m.label)}</span><b>${esc(m.value)}</b></div>`).join('')}</section>`
            : ''
        }
        ${a.ifIgnored ? `<section class="card ignore"><h3>If you ignore it</h3><p>${esc(a.ifIgnored)}</p></section>` : ''}
      </div>

      ${verifyCard(doc)}
      ${replyCard(doc)}
      ${chatCard(doc)}

      <p class="disclaimer">PaperPal is an AI assistant, not a lawyer. For big decisions, check with the sender or a local advice service.</p>
    </div>
  </main>`;
}

function papersView() {
  const sorted = [...docs].sort((a, b) => {
    const da = nextDue(a) ?? '9999';
    const db = nextDue(b) ?? '9999';
    return da === db ? b.created - a.created : da < db ? -1 : 1;
  });
  return `
  <main class="papers">
    <div class="papers-h"><h1>My papers</h1><a class="btn primary" href="#/">+ New paper</a></div>
    ${
      sorted.length
        ? `<div class="grid">${sorted
            .map((d) => {
              const due = nextDue(d);
              const l = dueLabel(due);
              const n = d.analysis.actions.length;
              const k = d.done.filter(Boolean).length;
              return `<article class="paper-card">
              <a href="#/doc/${d.id}" class="pc-link">
                ${d.thumb ? `<img src="${d.thumb}" alt="" />` : '<div class="noimg">📝</div>'}
                <div class="pc-body">
                  <span class="due ${due ? l.cls : 'none'}">${due ? l.text : n && k === n ? 'All done ✓' : 'No deadline'}</span>
                  <h3>${esc(d.analysis.title)}</h3>
                  <p class="muted">${esc(d.analysis.sender)}</p>
                  <div class="prog"><i style="width:${n ? (k / n) * 100 : 100}%"></i></div>
                </div>
              </a>
              <button class="del" data-act="del" data-id="${d.id}">${confirmDelete === d.id ? 'Delete?' : '✕'}</button>
            </article>`;
            })
            .join('')}</div>`
        : `<div class="empty"><p>Nothing here yet.</p><a class="btn primary" href="#/">Explain your first document</a></div>`
    }
    <p class="muted small center">Saved only in this browser.</p>
  </main>`;
}

function settingsModal() {
  return `
  <div class="modal-bg" data-act="close-settings">
    <div class="modal" role="dialog" aria-label="Settings">
      <h3>Your preferences</h3>
      <label>Explain documents in
        <select id="pref-lang">${LANGS.map(([v, n]) => `<option value="${v}" ${v === prefs.lang ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label>Country you live in <span class="muted small">(better source checks)</span>
        <input id="pref-country" value="${esc(prefs.country)}" placeholder="e.g. South Korea" />
      </label>
      <label>Your name <span class="muted small">(to sign replies)</span>
        <input id="pref-name" value="${esc(prefs.name)}" placeholder="optional" />
      </label>
      <div class="row-btns"><button class="btn primary" data-act="save-settings">Save</button><button class="btn ghost" data-act="close-settings">Cancel</button></div>
    </div>
  </div>`;
}

function footer() {
  return `<footer class="foot">Built with <b>NVIDIA Nemotron</b> on <b>Nebius Token Factory</b> · live search by <b>Tavily</b> · open source (MIT)</footer>`;
}

/* ---------------------------------------------------------------- render */

function render() {
  const r = route();
  const focusId = (document.activeElement as HTMLElement | null)?.id;
  const chatDraft = (document.getElementById('chat-input') as HTMLInputElement | null)?.value ?? '';
  const pasteDraft = (document.getElementById('paste-text') as HTMLTextAreaElement | null)?.value ?? '';
  let body: string;
  if (r === 'reading') body = readingView();
  else if (r === 'papers') body = papersView();
  else if (r.startsWith('doc/')) {
    const d = currentDoc();
    body = d ? docView(d) : papersView();
  } else body = homeView();
  app.innerHTML = `${header()}${body}${footer()}${showSettings ? settingsModal() : ''}${flash ? `<div class="toast">${esc(flash)}</div>` : ''}`;
  const ci = document.getElementById('chat-input') as HTMLInputElement | null;
  if (ci) ci.value = chatDraft;
  const pt = document.getElementById('paste-text') as HTMLTextAreaElement | null;
  if (pt) pt.value = pasteDraft;
  if (focusId) document.getElementById(focusId)?.focus();
  bindInputs();
}

function bindInputs() {
  for (const id of ['file-cam', 'file-up']) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    el?.addEventListener('change', () => handleFiles(el.files));
  }
  const drop = document.getElementById('drop');
  if (drop) {
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      handleFiles(e.dataTransfer?.files ?? null);
    });
  }
  const tone = document.getElementById('tone') as HTMLSelectElement | null;
  tone?.addEventListener('change', () => (replyOpts.tone = tone.value));
  const notes = document.getElementById('notes') as HTMLInputElement | null;
  notes?.addEventListener('input', () => (replyOpts.notes = notes.value));
}

app.addEventListener('click', async (e) => {
  const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!t) return;
  const act = t.dataset.act!;
  const doc = currentDoc();
  switch (act) {
    case 'settings':
      showSettings = true;
      render();
      break;
    case 'close-settings':
      if (e.target === t) {
        showSettings = false;
        render();
      }
      break;
    case 'save-settings':
      prefs = {
        lang: (document.getElementById('pref-lang') as HTMLSelectElement).value,
        country: (document.getElementById('pref-country') as HTMLInputElement).value.trim(),
        name: (document.getElementById('pref-name') as HTMLInputElement).value.trim(),
      };
      savePrefs(prefs);
      showSettings = false;
      render();
      toast('Saved. New documents will be explained in ' + prefs.lang + '.');
      break;
    case 'paste':
      pasteOpen = !pasteOpen;
      render();
      document.getElementById('paste-text')?.focus();
      break;
    case 'paste-go': {
      const text = (document.getElementById('paste-text') as HTMLTextAreaElement).value;
      analyze({ images: [], text, thumb: '' });
      break;
    }
    case 'sample':
      runSample(t.dataset.id!);
      break;
    case 'toggle':
      if (doc) {
        const i = Number(t.dataset.i);
        doc.done[i] = (t as HTMLInputElement).checked;
        persist();
        render();
      }
      break;
    case 'ics':
      if (doc) {
        download(`paperpal-${doc.id}.ics`, deadlinesIcs(doc));
        toast('Calendar file downloaded — open it to add the reminders.');
      }
      break;
    case 'notify':
      if (!('Notification' in window)) toast('This browser has no notifications — use the calendar file instead.');
      else {
        const p = await Notification.requestPermission();
        toast(p === 'granted' ? 'Reminders on: PaperPal will nudge you 3 days before each deadline when open.' : 'Notifications are blocked — the calendar file works too.');
        remindDue();
      }
      break;
    case 'copy':
      await navigator.clipboard?.writeText(t.dataset.v || '');
      toast('Copied');
      break;
    case 'copy-reply':
      if (doc?.reply) {
        await navigator.clipboard?.writeText((doc.reply.subject ? doc.reply.subject + '\n\n' : '') + doc.reply.body);
        toast('Reply copied');
      }
      break;
    case 'toggle-tr':
      showTranslation = !showTranslation;
      render();
      break;
    case 'reply':
      if (doc) draftReply(doc);
      break;
    case 'reverify':
      if (doc) verify(doc);
      break;
    case 'suggest':
      if (doc) ask(doc, t.textContent || '');
      break;
    case 'del': {
      const id = t.dataset.id!;
      if (confirmDelete === id) {
        docs = docs.filter((d) => d.id !== id);
        persist();
        confirmDelete = '';
      } else {
        confirmDelete = id;
        setTimeout(() => {
          if (confirmDelete === id) {
            confirmDelete = '';
            render();
          }
        }, 3000);
      }
      render();
      break;
    }
  }
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target as HTMLElement;
  if (form.dataset.form === 'chat') {
    const doc = currentDoc();
    const input = document.getElementById('chat-input') as HTMLInputElement;
    const q = input.value;
    input.value = '';
    if (doc) ask(doc, q);
  }
});

// paste a screenshot straight from the clipboard on the home screen
document.addEventListener('paste', (e) => {
  if (route() !== '') return;
  const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
  if (files.length) {
    e.preventDefault();
    handleFiles(files);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && showSettings) {
    showSettings = false;
    render();
  }
});

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});

if (route() === 'reading') history.replaceState(null, '', '#/');
render();
remindDue();
