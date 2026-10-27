/**
 * Built-in sample documents so judges can try PaperPal in one click.
 * All are FICTIONAL (invented organisations, names and numbers), drawn on a canvas as a "scan".
 */

export interface Sample {
  id: string;
  label: string;
  flag: string;
  hint: string;
  draw: () => string; // returns a JPEG data URL
}

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
};
const fmt = (d: Date, sep = '-') => `${d.getFullYear()}${sep}${String(d.getMonth() + 1).padStart(2, '0')}${sep}${String(d.getDate()).padStart(2, '0')}`;
const fmtRu = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
const fmtDe = fmtRu;

function sheet(draw: (g: CanvasRenderingContext2D, w: number) => void) {
  const w = 1240;
  const h = 1650;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fdfcf8';
  g.fillRect(0, 0, w, h);
  // faint scan noise
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.035})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.fillStyle = '#1b1b1b';
  g.textBaseline = 'top';
  draw(g, w);
  // slight rotation like a phone photo
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const o = out.getContext('2d')!;
  o.fillStyle = '#d9d4c7';
  o.fillRect(0, 0, w, h);
  o.translate(w / 2, h / 2);
  o.rotate(-0.008);
  o.drawImage(c, -w / 2, -h / 2);
  return out.toDataURL('image/jpeg', 0.88);
}

function para(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}

/** Korean university tuition notice (fictional) */
function korean() {
  const due = iso(9);
  return sheet((g, w) => {
    g.fillStyle = '#123a73';
    g.fillRect(0, 0, w, 150);
    g.fillStyle = '#fff';
    g.font = 'bold 52px sans-serif';
    g.fillText('한빛대학교', 80, 40);
    g.font = '26px sans-serif';
    g.fillText('HANBIT UNIVERSITY · 국제교류처', 80, 104);
    g.fillStyle = '#1b1b1b';
    g.font = 'bold 44px sans-serif';
    g.fillText('2026학년도 2학기 등록금 납부 안내', 80, 210);
    g.font = '28px sans-serif';
    let y = 300;
    y = para(g, `수신: 외국인 유학생 귀하 (학번 2026-41187)`, 80, y, w - 160, 44);
    y = para(g, `본교 학칙 제34조에 따라 2026학년도 2학기 등록금을 아래와 같이 안내하오니 기한 내에 납부하여 주시기 바랍니다. 기한 내 미납 시 미등록으로 처리되어 제적될 수 있으며, 외국인등록증(D-2 비자) 연장에 필요한 재학증명서 발급이 제한됩니다.`, 80, y + 10, w - 160, 44);
    y += 30;
    const rows: [string, string][] = [
      ['수업료', '3,850,000원'],
      ['기숙사비 (한빛관 2인실)', '1,240,000원'],
      ['국민건강보험료 (6개월)', '420,000원'],
      ['장학금 감면 (성적우수 30%)', '- 1,155,000원'],
      ['납부 총액', '4,355,000원'],
    ];
    g.strokeStyle = '#333';
    g.lineWidth = 2;
    rows.forEach(([k, v], i) => {
      const ry = y + i * 64;
      g.strokeRect(80, ry, w - 160, 64);
      g.font = i === rows.length - 1 ? 'bold 30px sans-serif' : '28px sans-serif';
      g.fillText(k, 104, ry + 16);
      g.textAlign = 'right';
      g.fillText(v, w - 104, ry + 16);
      g.textAlign = 'left';
    });
    y += rows.length * 64 + 40;
    g.font = 'bold 30px sans-serif';
    g.fillText(`납부 기한: ${fmt(due, '. ')}. (오후 4시까지)`, 80, y);
    g.font = '28px sans-serif';
    y = para(g, `납부 방법: 학생포털에 표시된 본인 전용 가상계좌 또는 학생포털 > 등록 > 카드납부. 분할납부를 원하는 학생은 납부 기한 3일 전까지 국제교류처에 신청서를 제출해야 합니다.`, 80, y + 60, w - 160, 44);
    y = para(g, `문의: 국제교류처 학사지원팀 (내선 4127, 본관 2층 214호)`, 80, y + 20, w - 160, 44);
    g.font = 'bold 30px sans-serif';
    g.fillText('한빛대학교 국제교류처장', w - 590, 1460);
    g.strokeStyle = '#c0392b';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(w - 140, 1475, 52, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#c0392b';
    g.font = 'bold 26px sans-serif';
    g.fillText('직인', w - 166, 1460);
  });
}

/** German parking fine (fictional city) */
function german() {
  const issued = iso(-4);
  return sheet((g, w) => {
    g.font = 'bold 30px serif';
    g.fillText('Stadt Lindenfeld', 80, 70);
    g.font = '24px serif';
    g.fillText('Ordnungsamt · Bußgeldstelle · Marktplatz 3 · 99999 Lindenfeld', 80, 112);
    g.fillRect(80, 150, w - 160, 3);
    g.font = '26px serif';
    g.fillText('Herrn/Frau  A. Student', 80, 210);
    g.fillText('Uferstraße 12, 99999 Lindenfeld', 80, 246);
    g.textAlign = 'right';
    g.fillText(`Datum: ${fmtDe(issued)}`, w - 80, 210);
    g.fillText('Aktenzeichen: 41.2-7783-26', w - 80, 246);
    g.textAlign = 'left';
    g.font = 'bold 40px serif';
    g.fillText('Verwarnung mit Verwarnungsgeld', 80, 330);
    g.font = '28px serif';
    let y = 400;
    y = para(g, `Sehr geehrte Damen und Herren,`, 80, y, w - 160, 42);
    y = para(g, `Ihnen wird vorgeworfen, am ${fmtDe(iso(-9))} um 14:37 Uhr in Lindenfeld, Bahnhofstraße 21, mit dem Fahrzeug LF-AS 2026 im eingeschränkten Halteverbot länger als drei Minuten gehalten zu haben (§§ 41 Abs. 1 i.V.m. Anlage 2, 49 StVO; § 24 StVG).`, 80, y + 10, w - 160, 42);
    y = para(g, `Wegen dieser Ordnungswidrigkeit werden Sie verwarnt. Es wird ein Verwarnungsgeld in Höhe von 25,00 EUR erhoben.`, 80, y + 10, w - 160, 42);
    y = para(g, `Die Verwarnung ist nur wirksam, wenn Sie einverstanden sind und das Verwarnungsgeld innerhalb einer Woche nach Zugang dieses Schreibens zahlen. Zahlen Sie nicht fristgerecht, wird ein Bußgeldverfahren eingeleitet; es entstehen zusätzlich Gebühren und Auslagen von mindestens 28,50 EUR.`, 80, y + 10, w - 160, 42);
    y = para(g, `Wenn Sie den Vorwurf bestreiten, können Sie sich innerhalb derselben Frist schriftlich äußern (Anhörungsbogen anbei). Angaben zur Sache sind freiwillig.`, 80, y + 10, w - 160, 42);
    g.strokeStyle = '#222';
    g.lineWidth = 2;
    g.strokeRect(80, y + 20, w - 160, 230);
    g.font = 'bold 28px serif';
    g.fillText('Zahlungsangaben', 104, y + 40);
    g.font = '26px serif';
    g.fillText('Empfänger: Stadtkasse Lindenfeld', 104, y + 90);
    g.fillText('IBAN: siehe beiliegender Überweisungsträger', 104, y + 130);
    g.fillText('Verwendungszweck: 41.2-7783-26', 104, y + 170);
    g.fillText('Betrag: 25,00 EUR', 104, y + 210);
    g.font = '26px serif';
    g.fillText('Mit freundlichen Grüßen', 80, 1420);
    g.fillText('Im Auftrag  M. Keller', 80, 1460);
  });
}

/** Russian lease renewal notice (fictional) */
function russian() {
  const until = iso(14);
  return sheet((g, w) => {
    g.font = 'bold 34px serif';
    g.textAlign = 'center';
    g.fillText('УВЕДОМЛЕНИЕ', w / 2, 90);
    g.font = '28px serif';
    g.fillText('об изменении условий договора найма жилого помещения № 17/24', w / 2, 140);
    g.textAlign = 'left';
    g.font = '27px serif';
    g.fillText('г. Северогорск', 80, 220);
    g.textAlign = 'right';
    g.fillText(fmtRu(iso(-2)), w - 80, 220);
    g.textAlign = 'left';
    let y = 300;
    y = para(g, `Уважаемый наниматель! Настоящим ООО «УК Северный Квартал» (наймодатель) уведомляет Вас, что срок действия договора найма квартиры по адресу: ул. Полярная, д. 8, кв. 45 истекает ${fmtRu(iso(40))}.`, 80, y, w - 160, 42);
    y = para(g, `В соответствии с п. 6.2 договора наймодатель предлагает продлить договор на 11 месяцев на следующих условиях:`, 80, y + 10, w - 160, 42);
    y = para(g, `1) ежемесячная плата за наём увеличивается с 32 000 до 38 500 рублей;`, 120, y + 6, w - 200, 42);
    y = para(g, `2) коммунальные платежи (электроэнергия, вода) оплачиваются нанимателем отдельно по счётчикам;`, 120, y, w - 200, 42);
    y = para(g, `3) обеспечительный платёж подлежит доплате до размера месячной платы (6 500 рублей) при подписании дополнительного соглашения.`, 120, y, w - 200, 42);
    y = para(g, `Просим Вас сообщить о своём решении в письменной форме не позднее ${fmtRu(until)}. Если ответ не поступит в указанный срок, договор будет считаться продлённым на новых условиях.`, 80, y + 10, w - 160, 42);
    y = para(g, `В случае отказа от продления наниматель обязан освободить помещение и передать ключи по акту в последний день срока действия договора. Обеспечительный платёж возвращается в течение 10 рабочих дней после подписания акта при отсутствии задолженности и повреждений.`, 80, y + 10, w - 160, 42);
    y = para(g, `Ответ направляйте в письменном виде по адресу: ул. Полярная, д. 2, офис 3 (отдел аренды, приём пн–пт 9:00–18:00).`, 80, y + 10, w - 160, 42);
    g.fillText('Генеральный директор', 80, 1430);
    g.fillText('ООО «УК Северный Квартал»  ____________  И. П. Морозов', 80, 1475);
  });
}

export const SAMPLES: Sample[] = [
  { id: 'kr', label: 'Tuition notice', flag: '🇰🇷', hint: 'Korean university bill', draw: korean },
  { id: 'de', label: 'Parking fine', flag: '🇩🇪', hint: 'German city office', draw: german },
  { id: 'ru', label: 'Lease renewal', flag: '🇷🇺', hint: 'Russian landlord letter', draw: russian },
];

export { fmt as isoDate };
