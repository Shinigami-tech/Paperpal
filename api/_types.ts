/** Data shapes shared by the API and the web app. */

export interface Action {
  step: string;
  /** ISO date (YYYY-MM-DD) or null if the document gives none */
  deadline: string | null;
  /** true when the date had to be estimated (e.g. 'within a week of receipt') */
  estimated?: boolean;
  urgency: 'high' | 'medium' | 'low';
  /** where / how to do it (portal, office, phone, email) if stated */
  how?: string;
}

export interface Analysis {
  title: string;
  docType: string;
  sender: string;
  /** language the document is written in */
  docLanguage: string;
  /** 2-4 sentences, plain words, in the user's language */
  summary: string;
  /** one sentence: what they want from you */
  ask: string;
  actions: Action[];
  amounts: { label: string; value: string }[];
  /** what happens if you ignore it */
  ifIgnored: string;
  /** reference numbers, IDs, contact details worth keeping */
  keyFacts: { label: string; value: string }[];
  /** does it expect a written answer */
  replyNeeded: boolean;
  /** red flags: possible scam, missing info, unusual demands */
  warnings: string[];
  /** web searches that would confirm the rules / procedure behind this document */
  verifyQueries: string[];
  /** 0..1 how sure the model is that it read the document correctly */
  confidence: number;
}

export interface Check {
  claim: string;
  status: 'confirmed' | 'differs' | 'unclear';
  note: string;
  sources: { title: string; url: string }[];
}

export interface Verification {
  checks: Check[];
  tip: string;
}

export interface Reply {
  subject: string;
  /** in the document's language */
  body: string;
  /** the same reply translated into the user's language */
  translation: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
