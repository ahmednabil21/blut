import html2canvas from 'html2canvas';
import { KEYUTIL, KJUR, stob64, hextorstr } from 'jsrsasign';
import qz from 'qz-tray';
import { QZ_CERTIFICATE_PEM } from '../qz/certificate';
import { QZ_PRIVATE_KEY_PEM } from '../qz/privateKey';
import {
  PAPER_HEIGHT_MM,
  PAPER_SIDE_MARGIN_MM,
  PAPER_WIDTH_MM,
  PRINTABLE_WIDTH_MM,
  PRINTER_MODE,
  thermalCaptureScale,
  thermalContentWidthCssPx,
  thermalPrinterWidthDots,
} from '../config/thermalPaper';

/** اسم الطابعة الموحّد لدى الوكلاء (QZ Tray) */
export const QZ_DEFAULT_PRINTER_NAME = 'CP-Q3';

/** توافق مع الاستيرادات القديمة */
export const QZ_PAGE_WIDTH_MM = PAPER_WIDTH_MM;
export const QZ_PAGE_HEIGHT_MM = PAPER_HEIGHT_MM;
export const QZ_PRINTABLE_WIDTH_MM = PRINTABLE_WIDTH_MM;

let connectPromise: Promise<void> | null = null;
let securityConfigured = false;

function configureQzSecurity(): void {
  if (securityConfigured) return;
  securityConfigured = true;

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

function applyThermalContentBox(el: HTMLElement, widthPx: number): void {
  el.style.width = `${widthPx}px`;
  el.style.maxWidth = `${widthPx}px`;
  el.style.minWidth = `${widthPx}px`;
  el.style.margin = '0';
  el.style.boxSizing = 'border-box';
  el.style.background = '#ffffff';
  // منع أي وضع عمودي قد يسبب «حرف فوق حرف»
  el.style.writingMode = 'horizontal-tb';
  el.style.direction = 'rtl';
}

/**
 * HTML → PNG (تشكيل عربي في المتصفح).
 * لا نستخدم ESC/POS text mode ولا QZ format:html للنص العربي.
 */
async function renderHtmlToPngBase64(html: string): Promise<string> {
  const widthPx = thermalContentWidthCssPx(PRINTABLE_WIDTH_MM);
  const captureScale = thermalCaptureScale(PRINTABLE_WIDTH_MM);

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
  iframe.setAttribute('title', 'qz-arabic-raster');
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

    doc.body.style.margin = '0';
    doc.body.style.padding = '0';
    doc.body.style.display = 'block';
    applyThermalContentBox(doc.body, widthPx);

    await waitForImages(doc);
    if (doc.fonts?.ready) {
      try {
        await Promise.race([
          doc.fonts.ready,
          new Promise<void>((r) => setTimeout(r, 2500)),
        ]);
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((r) => setTimeout(r, 200));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const target =
      (doc.querySelector('.paper') as HTMLElement | null) ||
      (doc.querySelector('.receipt') as HTMLElement | null) ||
      doc.body;

    applyThermalContentBox(target, widthPx);

    const contentHeight = Math.max(target.scrollHeight, target.offsetHeight, 120);
    iframe.style.height = `${contentHeight + 16}px`;
    iframe.style.width = `${widthPx}px`;

    const canvas = await html2canvas(target, {
      scale: captureScale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 5000,
      // عرض المحتوى فقط — بدون توسيع يضيف فراغاً أبيض (سبب العرض الضيق سابقاً)
      width: widthPx,
      height: contentHeight,
      windowWidth: widthPx,
      windowHeight: contentHeight,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      onclone: (_clonedDoc, element) => {
        applyThermalContentBox(element, widthPx);
        element.style.fontFamily =
          '"Segoe UI", Tahoma, "Noto Naskh Arabic", Arial, sans-serif';
        element.style.fontWeight = '700';
        element.style.color = '#000';
        element.style.background = '#ffffff';
      },
    });

    if (canvas.width < 100) {
      throw new Error('QZ_RENDER_TOO_NARROW');
    }

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/i, '');
    if (!base64) throw new Error('QZ_RENDER_EMPTY');
    return base64;
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}

/**
 * QZ: طباعة صورة فقط (pixel/image) على عرض الرول 80mm.
 * scaleContent: true يملأ عرض الصفحة حتى لا يبقى الإيصال ضيقاً ومتمركزاً.
 */
export async function printHtmlViaQz(
  html: string,
  options?: { printerName?: string; jobName?: string }
): Promise<void> {
  await ensureQzConnected();
  const printer = await resolvePrinterName(options?.printerName);
  const imageBase64 = await renderHtmlToPngBase64(html);

  const config = qz.configs.create(printer, {
    // الصفحة = عرض الرول الفعلي (80 أو 58)
    size: { width: PAPER_WIDTH_MM },
    units: 'mm',
    margins: {
      top: 0,
      right: PAPER_SIDE_MARGIN_MM,
      bottom: 0,
      left: PAPER_SIDE_MARGIN_MM,
    },
    // املأ عرض الصفحة القابل للطباعة بالصورة (يمنع التمركز الضيق)
    scaleContent: true,
    rasterize: true,
    interpolation: 'nearest-neighbor',
    colorType: 'grayscale',
    copies: 1,
    jobName: options?.jobName || 'Wakeel Print',
  });

  // مهم: type=pixel + format=image فقط — لا raw ولا html text (يفسد العربية)
  await qz.print(config, [
    {
      type: 'pixel',
      format: 'image',
      flavor: 'base64',
      data: imageBase64,
      options: {
        pageWidth: PAPER_WIDTH_MM,
        scaleContent: true,
      },
    },
  ]);
}

/**
 * احتياطي المتصفح: يطبع صورة PNG وليس HTML نصي.
 * طابعات حرارية كثيرة تفسّر HTML/GDI كـ text → أحرف عربية عمودية.
 */
export async function printHtmlViaBrowserDialog(html: string): Promise<void> {
  const imageBase64 = await renderHtmlToPngBase64(html);
  const widthPx = thermalContentWidthCssPx(PRINTABLE_WIDTH_MM);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'silent-print-raster-fallback');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${PAPER_WIDTH_MM}mm`;
  iframe.style.height = `${PAPER_HEIGHT_MM}mm`;
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
  printDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: ${PAPER_WIDTH_MM}mm auto; margin: ${PAPER_SIDE_MARGIN_MM}mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${PAPER_WIDTH_MM}mm;
      max-width: ${PAPER_WIDTH_MM}mm;
      background: #fff;
    }
    img.receipt-raster {
      display: block;
      width: ${PRINTABLE_WIDTH_MM}mm;
      max-width: 100%;
      height: auto;
      margin: 0 auto;
      image-rendering: pixelated;
    }
    @media print {
      html, body { width: ${PAPER_WIDTH_MM}mm !important; }
      img.receipt-raster { width: ${PRINTABLE_WIDTH_MM}mm !important; }
    }
  </style>
</head>
<body>
  <img class="receipt-raster" width="${widthPx}" alt="" src="data:image/png;base64,${imageBase64}" />
</body>
</html>`);
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
 * يفضّل QZ Tray (صورة)؛ عند الفشل يطبع صورة أيضاً عبر حوار المتصفح.
 */
export async function printHtmlSilentOrDialog(
  html: string,
  options?: { printerName?: string; jobName?: string }
): Promise<'qz' | 'browser'> {
  try {
    await printHtmlViaQz(html, options);
    return 'qz';
  } catch (err) {
    console.warn('[print] QZ Tray unavailable, falling back to browser raster print', err);
    await printHtmlViaBrowserDialog(html);
    return 'browser';
  }
}

/** للتشخيص */
export function getThermalPrintDebugInfo() {
  return {
    printerMode: PRINTER_MODE,
    paperWidthMm: PAPER_WIDTH_MM,
    printableWidthMm: PRINTABLE_WIDTH_MM,
    sideMarginMm: PAPER_SIDE_MARGIN_MM,
    contentWidthCssPx: thermalContentWidthCssPx(PRINTABLE_WIDTH_MM),
    printerDots: thermalPrinterWidthDots(PRINTABLE_WIDTH_MM),
    captureScale: thermalCaptureScale(PRINTABLE_WIDTH_MM),
    path: 'React HTML → html2canvas PNG → QZ pixel/image (no ESC/POS text, no Python printer)',
    arabicStrategy: 'raster-only (never raw text / never QZ html text mode)',
    widthBug:
      'سابقاً: لقطة 640px مع محتوى CSS≈302px → ضيق. والطباعة بـ 72mm بدون ملء 80mm → تمركز.',
  };
}
