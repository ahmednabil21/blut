/**
 * إعداد مركزي لورق الطباعة الحرارية (POS).
 *
 * غيّر العرض عبر:
 * - REACT_APP_THERMAL_PAPER_WIDTH_MM=80  (افتراضي)
 * - REACT_APP_THERMAL_PAPER_WIDTH_MM=58
 *
 * ملاحظة: عرض الرول ≠ بالضرورة عرض منطقة الطباعة الفعلية.
 * نستخدم PRINTABLE_WIDTH_MM (بعد طرح الهوامش الجانبية).
 */

export type ThermalPaperWidthMm = 58 | 80;

/** CSS: 96 DPI → mm (المتصفح يحوّل mm إلى px هكذا) */
export const CSS_PX_PER_MM = 96 / 25.4;

function parsePaperWidthMm(raw: string | undefined): ThermalPaperWidthMm {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (n === 58) return 58;
  return 80;
}

/** عرض الرول / صفحة الطباعة (مم) — الافتراضي 80 */
export const PAPER_WIDTH_MM: ThermalPaperWidthMm = parsePaperWidthMm(
  typeof process !== 'undefined' ? process.env.REACT_APP_THERMAL_PAPER_WIDTH_MM : undefined
);

/** هامش جانبي داخل الرول (مم) — الطابعات الحرارية نادراً تطبع حتى حافة الرول */
export const PAPER_SIDE_MARGIN_MM = PAPER_WIDTH_MM === 58 ? 2 : 4;

/**
 * عرض المحتوى القابل للطباعة (مم).
 * 80mm رول → ≈72mm | 58mm رول → ≈54mm
 */
export const PRINTABLE_WIDTH_MM = PAPER_WIDTH_MM - PAPER_SIDE_MARGIN_MM * 2;

/** ارتفاع صفحة افتراضي لحوار المتصفح فقط (مم) */
export const PAPER_HEIGHT_MM = 297;

/** عرض المحتوى بوحدة بكسل CSS (يجب أن يطابق ما يرسمه المتصفح لـ N mm) */
export function thermalContentWidthCssPx(widthMm: number = PRINTABLE_WIDTH_MM): number {
  return Math.max(1, Math.round(widthMm * CSS_PX_PER_MM));
}

/** قيم جاهزة لـ @page / CSS داخل HTML الإيصال */
export function thermalReceiptCssVars(widthMm: number = PRINTABLE_WIDTH_MM): {
  paperWidthMm: number;
  printableWidthMm: number;
  contentWidthPx: number;
  sideMarginMm: number;
  pageHeightMm: number;
} {
  return {
    paperWidthMm: PAPER_WIDTH_MM,
    printableWidthMm: widthMm,
    contentWidthPx: thermalContentWidthCssPx(widthMm),
    sideMarginMm: PAPER_SIDE_MARGIN_MM,
    pageHeightMm: PAPER_HEIGHT_MM,
  };
}
