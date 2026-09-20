import qz from 'qz-tray';

/** اسم الطابعة الموحّد لدى الوكلاء (QZ Tray) */
export const QZ_DEFAULT_PRINTER_NAME = 'CP-Q3';

/** مقاس الورق الحراري المطلوب: 80 (عرض قابل للطباعة ≈ 72.1) × 297 مم */
export const QZ_PAGE_WIDTH_MM = 80;
export const QZ_PAGE_HEIGHT_MM = 297;
export const QZ_PRINTABLE_WIDTH_MM = 72.1;

let connectPromise: Promise<void> | null = null;

async function ensureQzConnected(): Promise<void> {
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

/**
 * طباعة HTML صامتة عبر QZ Tray على CP-Q3 (أو الافتراضية إن لم تُوجد).
 */
export async function printHtmlViaQz(
  html: string,
  options?: { printerName?: string; jobName?: string }
): Promise<void> {
  await ensureQzConnected();
  const printer = await resolvePrinterName(options?.printerName);

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
      format: 'html',
      flavor: 'plain',
      data: html,
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

  const images = Array.from(printDoc.images || []);
  await Promise.all(
    images.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
    )
  );
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
