import { getNumberLocale } from './localeDigits';

export const BAGHDAD_TIME_ZONE = 'Asia/Baghdad';

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** تحويل الأرقام اللاتينية إلى عربية-هندية عند وضع الأرقام العربي */
export function localizeDateDigits(text: string, locale?: string): string {
  const loc = locale ?? getNumberLocale();
  if (!loc.startsWith('ar')) return text;
  return text.replace(/\d/g, (d) => AR_DIGITS[Number(d)] ?? d);
}

/** yyyy/MM/dd */
export function formatYmdParts(y: string, m: string, d: string, locale?: string): string {
  return localizeDateDigits(`${y}/${m}/${d}`, locale);
}

/**
 * تحليل تاريخ من الـ API — عند غياب timezone يُفترض توقيت بغداد (+3).
 */
export function parseApiDateInput(value: string | null | undefined): Date | null {
  const s = (value ?? '').toString().trim();
  if (!s) return null;
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
  if (hasTz) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?)?$/
  );
  if (!m) {
    const fallback = new Date(s);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, yy, mm, dd, hh = '00', mi = '00', ss = '00', ms = '0'] = m;
  const millisecond = Number(ms.padEnd(3, '0').slice(0, 3));
  const utcTs =
    Date.UTC(Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss), millisecond) -
    3 * 60 * 60 * 1000;
  const d = new Date(utcTs);
  return Number.isNaN(d.getTime()) ? null : d;
}

function baghdadYmdParts(date: Date): { y: string; m: string; d: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BAGHDAD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return {
    y: parts.find((p) => p.type === 'year')?.value ?? '',
    m: parts.find((p) => p.type === 'month')?.value ?? '',
    d: parts.find((p) => p.type === 'day')?.value ?? '',
  };
}

function wantsDateTime(options?: Intl.DateTimeFormatOptions): boolean {
  if (!options) return false;
  return Boolean(options.timeStyle || options.hour != null || options.minute != null);
}

/**
 * عرض التاريخ بصيغة YYYY/MM/DD (توقيت بغداد).
 * مع خيارات وقت: YYYY/MM/DD HH:mm
 */
export function formatDisplayDate(
  input: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  const loc = locale ?? getNumberLocale();
  if (input == null || input === '') return '';

  if (typeof input === 'string') {
    const trimmed = input.trim();
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnly && !wantsDateTime(options)) {
      return formatYmdParts(dateOnly[1], dateOnly[2], dateOnly[3], loc);
    }
  }

  const date =
    typeof input === 'string' ? parseApiDateInput(input) : input instanceof Date ? input : null;
  if (!date || Number.isNaN(date.getTime())) return '';

  const { y, m, d } = baghdadYmdParts(date);
  const dateStr = formatYmdParts(y, m, d, loc);

  if (!wantsDateTime(options)) return dateStr;

  const timeFmt: Intl.DateTimeFormatOptions = {
    timeZone: BAGHDAD_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: loc.startsWith('ar'),
  };
  if (options?.second != null || options?.timeStyle === 'medium' || options?.timeStyle === 'long') {
    timeFmt.second = '2-digit';
  }
  const timeStr = new Intl.DateTimeFormat(loc, timeFmt).format(date);
  return `${dateStr} ${localizeDateDigits(timeStr, loc)}`;
}

/** تاريخ + وقت مختصر (للجداول التي تعرض التاريخ والوقت معاً) */
export function formatDisplayDateTime(
  input: Date | string | null | undefined,
  locale?: string
): string {
  return formatDisplayDate(input, { hour: '2-digit', minute: '2-digit' }, locale);
}
