/**
 * إعداد مركزي لورق طابعة POS الحرارية.
 *
 * المسار الفعلي في المشروع (لا يوجد ESC/POS في الباكند):
 *   React HTML → html2canvas (PNG) → QZ Tray pixel/image → Windows printer → CP-Q3
 *
 * العربية تُطبع دائماً كـ raster/image (لا text mode / لا code page).
 *
 * تغيير المقاس:
 *   REACT_APP_THERMAL_PAPER_WIDTH_MM=80   (افتراضي)
 *   REACT_APP_THERMAL_PAPER_WIDTH_MM=58
 */

export type ThermalPaperWidthMm = 58 | 80;

/** CSS: المتصفح يحوّل 1mm ≈ 96/25.4 px */
export const CSS_PX_PER_MM = 96 / 25.4;

/** كثافة طابعات حرارية شائعة (CP-Q3 وغيرها) ≈ 203 DPI → 8 dots/mm */
export const PRINTER_DOTS_PER_MM = 8;

function parsePaperWidthMm(raw: string | undefined): ThermalPaperWidthMm {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (n === 58) return 58;
  return 80;
}

/** عرض الرول الفعلي (مم) */
export const PAPER_WIDTH_MM: ThermalPaperWidthMm = parsePaperWidthMm(
  typeof process !== 'undefined' ? process.env.REACT_APP_THERMAL_PAPER_WIDTH_MM : undefined
);

/**
 * وضع الطابعة — مشتق من عرض الرول.
 * لا تصغّر تصميم 80mm إلى 58mm داخل رول 80.
 */
export const PRINTER_MODE: '80mm' | '58mm' =
  PAPER_WIDTH_MM === 58 ? '58mm' : '80mm';

/**
 * هامش جانبي حقيقي للطابعة (مم).
 * 80mm: هامش ضيق حتى يستغل الإيصال معظم الرول (ليس تصميم 58).
 * 58mm: هامش أصغر قليلاً.
 */
export const PAPER_SIDE_MARGIN_MM = PAPER_WIDTH_MM === 58 ? 2 : 2;

/**
 * عرض المحتوى القابل للطباعة (مم) = الرول − هامشين.
 * 80 → 76mm | 58 → 54mm
 */
export const PRINTABLE_WIDTH_MM = PAPER_WIDTH_MM - PAPER_SIDE_MARGIN_MM * 2;

/** ارتفاع صفحة افتراضي لحوار المتصفح */
export const PAPER_HEIGHT_MM = 297;

/** عرض المحتوى ببكسل CSS (للـ HTML / html2canvas layout) */
export function thermalContentWidthCssPx(widthMm: number = PRINTABLE_WIDTH_MM): number {
  return Math.max(1, Math.round(widthMm * CSS_PX_PER_MM));
}

/**
 * عرض هدف الطابعة بالنقاط (203 DPI).
 * يُستخدم لقياس وضوح الصورة عند الالتقاط (scale = dots / cssPx).
 */
export function thermalPrinterWidthDots(widthMm: number = PRINTABLE_WIDTH_MM): number {
  return Math.max(1, Math.round(widthMm * PRINTER_DOTS_PER_MM));
}

/** مقياس html2canvas بحيث تخرج الصورة بعرض نقاط الطابعة تقريباً */
export function thermalCaptureScale(widthMm: number = PRINTABLE_WIDTH_MM): number {
  const cssPx = thermalContentWidthCssPx(widthMm);
  const dots = thermalPrinterWidthDots(widthMm);
  const scale = dots / cssPx;
  // بين 2 و 3 غالباً كافٍ وواضح على 203 DPI
  return Math.min(3, Math.max(2, Number(scale.toFixed(3))));
}

export function thermalReceiptCssVars(widthMm: number = PRINTABLE_WIDTH_MM): {
  paperWidthMm: number;
  printableWidthMm: number;
  contentWidthPx: number;
  sideMarginMm: number;
  pageHeightMm: number;
  printerMode: '80mm' | '58mm';
  printerDots: number;
} {
  return {
    paperWidthMm: PAPER_WIDTH_MM,
    printableWidthMm: widthMm,
    contentWidthPx: thermalContentWidthCssPx(widthMm),
    sideMarginMm: PAPER_SIDE_MARGIN_MM,
    pageHeightMm: PAPER_HEIGHT_MM,
    printerMode: PRINTER_MODE,
    printerDots: thermalPrinterWidthDots(widthMm),
  };
}
