/** Turn whatever the user drops in (photo, screenshot, PDF, text file) into images + text for the model. */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface Prepared {
  images: string[];
  text: string;
  thumb: string;
}

const MAX = 1600;

function canvasToJpeg(c: HTMLCanvasElement, q = 0.85) {
  return c.toDataURL('image/jpeg', q);
}

export function scaleCanvas(src: CanvasImageSource, w: number, h: number, max = MAX) {
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export async function imageFile(file: Blob): Promise<Prepared> {
  const bmp = await createImageBitmap(file);
  const big = scaleCanvas(bmp, bmp.width, bmp.height);
  const small = scaleCanvas(bmp, bmp.width, bmp.height, 360);
  return { images: [canvasToJpeg(big)], text: '', thumb: canvasToJpeg(small, 0.7) };
}

export async function pdfFile(file: Blob): Promise<Prepared> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const images: string[] = [];
  let text = '';
  let thumb = '';
  const pages = Math.min(doc.numPages, 3);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const scale = MAX / Math.max(v1.width, v1.height);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
    images.push(canvasToJpeg(c));
    if (i === 1) thumb = canvasToJpeg(scaleCanvas(c, c.width, c.height, 360), 0.7);
    const tc = await page.getTextContent();
    text += tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n\n';
  }
  return { images, text: text.trim().length > 80 ? text.slice(0, 20000) : '', thumb };
}

export async function prepare(file: File): Promise<Prepared> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return pdfFile(file);
  if (file.type.startsWith('text/') || /\.(txt|md|eml)$/i.test(file.name)) {
    return { images: [], text: (await file.text()).slice(0, 20000), thumb: '' };
  }
  return imageFile(file);
}
