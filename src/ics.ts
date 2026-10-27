/** Export deadlines as an .ics calendar file with reminders (works with Apple, Google, Outlook calendars). */
import type { SavedDoc } from './store';

const esc = (s: string) => s.replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');

export function deadlinesIcs(doc: SavedDoc) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PaperPal//EN', 'CALSCALE:GREGORIAN'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  doc.analysis.actions.forEach((a, i) => {
    if (!a.deadline || !/^\d{4}-\d{2}-\d{2}/.test(a.deadline)) return;
    const day = a.deadline.slice(0, 10).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${doc.id}-${i}@paperpal`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `SUMMARY:${esc(`PaperPal: ${a.step}`)}`,
      `DESCRIPTION:${esc(`${doc.analysis.title} (${doc.analysis.sender})${a.how ? `\nHow: ${a.how}` : ''}`)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P3D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`In 3 days: ${a.step}`)}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT12H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`Tomorrow: ${a.step}`)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function download(name: string, text: string, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
