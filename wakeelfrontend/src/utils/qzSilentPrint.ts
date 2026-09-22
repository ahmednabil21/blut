import html2canvas from 'html2canvas';
import { KEYUTIL, KJUR, stob64, hextorstr } from 'jsrsasign';
import qz from 'qz-tray';
import { QZ_CERTIFICATE_PEM } from '../qz/certificate';
import { QZ_PRIVATE_KEY_PEM } from '../qz/privateKey';

/** اسم الطابعة الموحّد لدى الوكلاء (QZ Tray) */
export const QZ_DEFAULT_PRINTER_NAME = 'CP-Q3';

/** مقاس الورق الحراري المطلوب: 80 (عرض قابل للطباعة ≈ 72.1) × 297 مم */
export const QZ_PAGE_WIDTH_MM = 80;
export const QZ_PAGE_HEIGHT_MM = 297;
export const QZ_PRINTABLE_WIDTH_MM = 72.1;

/** ~203 DPI للطابعات الحرارية الشائعة */
const PRINT_PX_PER_MM = 8;

let connectPromise: Promise<void> | null = null;
let securityConfigured = false;

function configureQzSecurity(): void {
  if (securityConfigured) return;
  securityConfigured = true;

  // شهادة مضمّنة — لا تعتمد على مسار URL (يمنع Signature بدون شهادة مطابقة)
  qz.security.setCertificatePromise((resolve) => {
    resolve(QZ_CERTIFICATE_PEM);
  });

  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign: string) => {
    return (resolve, reject) => {
      try {
        const pk = KEYUTIL.getKey(QZ_PRIVATE_KEY_PEM);
        const sig = new KJUR.crypto.Signature({ alg: 'SHA512withRSA' });
        sig.init(pk);
        sig.updateString(toSign);
        resolve(stob64(hextorstr(sig.sign())));
      } catch (err) {
        reject(err);
      }
    };
  });
}

async function ensureQzConnected(): Promise<void> {
  configureQzSecurity();
  if (qz.websocket.isActive()) return;
  if (!connectPromise) {
    connectPromise = qz.websocket
      .connect()
      .catch((err) => {
        connectPromise = null;
        throw err;
      })
      .then(() => undefined);
  }
  await connectPromise;
}

async function resolvePrinterName(preferred?: string): Promise<string> {
  const wanted = (preferred || QZ_DEFAULT_PRINTER_NAME).trim();

  if (wanted) {
    try {
      const found = await qz.printers.find(wanted);
      if (typeof found === 'string' && found.trim()) return found;
      if (Array.isArray(found) && found.length > 0 && found[0]) return found[0];
    } catch {
      /* جرّب الافتراضية */
    }
  }

  const all = await qz.printers.find();
  const list = Array.isArray(all) ? all : all ? [all] : [];
  const exact = list.find((p) => p.trim().toLowerCase() === wanted.toLowerCase());
  if (exact) return exact;
  const partial = list.find((p) => p.toLowerCase().includes(wanted.toLowerCase()));
  if (partial) return partial;

  const def = await qz.printers.getDefault();
  if (def && String(def).trim()) return String(def);

  throw new Error('QZ_NO_PRINTER');
}

function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images || []);
  return Promise.all(
    images.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
    )
  ).then(() => undefined);
}

/**
 * يرندر HTML في المتصفح (تشكيل عربي صحيح) ثم يلتقطه كـ PNG base64.
 * QZ HTML rasterizer لا يشكّل الحروف العربية؛ الصورة تحل المشكلة.
 */
async function renderHtmlToPngBase64(html: string): Promise<string> {
  const widthPx = Math.round(QZ_PRINTABLE_WIDTH_MM * PRINT_PX_PER_MM);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${widthPx}px`,
    'background:#ffffff',
    'opacity:1',
    'pointer-events:none',
    'z-index:-1',
  ].join(';');

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'qz-arabic-render');
  iframe.style.cssText = `border:0;width:${widthPx}px;height:400px;overflow:hidden;background:#fff;`;
  host.appendChild(iframe);
  document.body.appendChild(host);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('PRINT_FRAME_FAILED'));
      iframe.srcdoc = html;
    });

    const doc = iframe.contentDocument;
    if (!doc?.body) throw new Error('PRINT_FRAME_FAILED');

    await waitForImages(doc);
    if (doc.fonts?.ready) {
      try {
        await Promise.race([
          doc.fonts.ready,
          new Promise<void>((r) => setTimeout(r, 2500)),
        ]);
      } catch {
        /* تجاهل */
      }
    }
    // وقت إضافي لتشكيل الخطوط العربية
    await new Promise<void>((r) => setTimeout(r, 200));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const target =
      (doc.querySelector('.paper') as HTMLElement | null) ||
      (doc.querySelector('.receipt') as HTMLElement | null) ||
      doc.body;

    const contentHeight = Math.max(target.scrollHeight, target.offsetHeight, doc.body.scrollHeight, 120);
    iframe.style.height = `${contentHeight + 24}px`;

    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 5000,
      width: Math.max(target.scrollWidth, widthPx),
      height: contentHeight,
      windowWidth: Math.max(target.scrollWidth, widthPx),
      windowHeight: contentHeight,
      onclone: (_clonedDoc, element) => {
        element.style.fontFamily = '"Segoe UI", Tahoma, "Noto Naskh Arabic", Arial, sans-serif';
        element.style.direction = 'rtl';
        element.style.fontWeight = '800';
        element.style.color = '#000';
      },
    });

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/i, '');
    if (!base64) throw new Error('QZ_RENDER_EMPTY');
    return base64;
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}

/**
 * طباعة صامتة عبر QZ: صورة من المتصفح للحفاظ على اتصال الحروف العربية.
 */
export async function printHtmlViaQz(
  html: string,
  options?: { printerName?: string; jobName?: string }
): Promise<void> {
  await ensureQzConnected();
  const printer = await resolvePrinterName(options?.printerName);
  const imageBase64 = await renderHtmlToPngBase64(html);

  const config = qz.configs.create(printer, {
    size: { width: QZ_PAGE_WIDTH_MM, height: QZ_PAGE_HEIGHT_MM },
    units: 'mm',
    margins: 0,
    scaleContent: true,
    rasterize: true,
    interpolation: 'nearest-neighbor',
    colorType: 'grayscale',
    copies: 1,
    jobName: options?.jobName || 'Wakeel Print',
  });

  await qz.print(config, [
    {
      type: 'pixel',
      format: 'image',
      flavor: 'base64',
      data: imageBase64,
      options: {
        pageWidth: QZ_PRINTABLE_WIDTH_MM,
      },
    },
  ]);
}

/** طباعة عبر مربع حوار المتصفح (iframe مخفي) — احتياطي عند غياب QZ */
export async function printHtmlViaBrowserDialog(html: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'silent-print-fallback');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${QZ_PAGE_WIDTH_MM}mm`;
  iframe.style.height = `${QZ_PAGE_HEIGHT_MM}mm`;
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-1';
  document.body.appendChild(iframe);

  const printDoc = iframe.contentDocument;
  const printWin = iframe.contentWindow;
  if (!printDoc || !printWin) {
    document.body.removeChild(iframe);
    throw new Error('PRINT_FRAME_FAILED');
  }

  printDoc.open();
  printDoc.write(html);
  printDoc.close();

  await waitForImages(printDoc);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  try {
    printWin.focus();
    printWin.print();
  } catch {
    cleanup();
    throw new Error('PRINT_FAILED');
  }

  if (typeof printWin.onafterprint !== 'undefined') {
    printWin.onafterprint = cleanup;
  } else {
    setTimeout(cleanup, 1500);
  }
}

/**
 * يفضّل QZ Tray؛ إن فشل (البرنامج غير شغّال) يعود لحوار المتصفح.
 */
export async function printHtmlSilentOrDialog(
  html: string,
  options?: { printerName?: string; jobName?: string }
): Promise<'qz' | 'browser'> {
  try {
    await printHtmlViaQz(html, options);
    return 'qz';
  } catch (err) {
    console.warn('[print] QZ Tray unavailable, falling back to browser print dialog', err);
    await printHtmlViaBrowserDialog(html);
    return 'browser';
  }
}
