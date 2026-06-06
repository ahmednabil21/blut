import type { ActivationInvoicePrintSettingsDto } from '../types';
import {
  DEFAULT_ACTIVATION_RECEIPT_BORROW_DAY_NOTE,
  DEFAULT_INVOICE_PRINT_FOOTER_LEGAL,
  SAS_BLUE_TI_RECEIPT_PASSWORD,
  ServiceType,
} from '../types';
import { ACTIVATION_RECEIPT_BUNDLED_ASSETS } from '../assets/activation-receipt';
import { formatDisplayDate } from './formatDisplayDate';

/** ملف في `public/` — شعار ثابت لفاتورة التفعيل (من نموذج الوصل) */
export const ACTIVATION_INVOICE_LOGO_FILENAME = 'activation-invoice-logo.png';
export const ACTIVATION_RECEIPT_QR_FILENAME = 'QR.png';

function publicAssetPath(filename: string): string {
  const publicBase =
    typeof process !== 'undefined' && process.env.PUBLIC_URL != null
      ? String(process.env.PUBLIC_URL).replace(/\/$/, '')
      : '';
  return `${publicBase}/${filename}`.replace(/\/+/g, '/');
}

/** رابط مطلق لأصل ثابت تحت `public/` (مع `PUBLIC_URL` مثل `/wakeel`). */
export function getActivationInvoiceStaticAssetUrl(appOrigin: string, filename: string): string {
  const origin = (appOrigin || '').replace(/\/$/, '');
  const rel = publicAssetPath(filename);
  if (!origin) return rel;
  return `${origin}${rel}`;
}

/** @deprecated استخدم getActivationInvoiceStaticAssetUrl */
export function getActivationInvoiceStaticLogoUrl(appOrigin: string): string {
  return getActivationInvoiceStaticAssetUrl(appOrigin, ACTIVATION_INVOICE_LOGO_FILENAME);
}

export type ActivationReceiptEmbeddedImages = {
  logo?: string | null;
  qr?: string | null;
};

/** روابط محتملة لملفات `public/` (مع/بدون بادئة `/wakeel` ومسار التطبيق الحالي). */
export function activationReceiptStaticAssetUrlCandidates(
  appOrigin: string,
  filename: string
): string[] {
  const origin = (
    appOrigin ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/$/, '');

  const relPaths: string[] = [
    publicAssetPath(filename),
    `/${filename}`,
    `/wakeel/${filename}`,
  ];

  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0) {
      relPaths.push(`/${segments[0]}/${filename}`);
    }
    const dir = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
    if (dir && dir !== '/') {
      relPaths.push(`${dir}/${filename}`);
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < relPaths.length; i++) {
    const rel = relPaths[i];
    const normalized = rel.startsWith('/') ? rel : `/${rel}`;
    const absolute = origin ? `${origin}${normalized}` : normalized;
    if (!seen.has(absolute)) {
      seen.add(absolute);
      out.push(absolute);
    }
  }
  return out;
}

/** يحوّل مسار Webpack أو نسبي إلى رابط مطلق على نفس المضيف. */
function resolveAbsoluteAssetUrl(url: string, appOrigin: string): string {
  const u = (url || '').trim();
  if (!u) return u;
  if (u.startsWith('data:') || /^https?:\/\//i.test(u)) return u;
  if (typeof window !== 'undefined') {
    try {
      return new URL(u, window.location.href).href;
    } catch {
      /* fallback */
    }
  }
  const origin = (appOrigin || '').replace(/\/$/, '');
  if (u.startsWith('/')) return origin ? `${origin}${u}` : u;
  return origin ? `${origin}/${u}` : u;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('read'));
    fr.readAsDataURL(blob);
  });
}

/** تحميل صورة عبر عنصر Image + canvas (يعمل reliably لملفات same-origin). */
async function imageUrlToDataUrl(url: string): Promise<string | null> {
  if (!url || url.startsWith('data:')) return url || null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width <= 0 || canvas.height <= 0) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const mime = url.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(mime));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function fetchFirstImageAsDataUrl(urls: string[]): Promise<string | null> {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue;
    if (url.startsWith('data:')) return url;

    const viaCanvas = await imageUrlToDataUrl(url);
    if (viaCanvas) return viaCanvas;

    try {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'default' });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob?.size) continue;
      return await blobToDataUrl(blob);
    } catch {
      /* جرّب الرابط التالي */
    }
  }
  return null;
}

function bundledAssetUrlCandidates(appOrigin: string, key: keyof typeof ACTIVATION_RECEIPT_BUNDLED_ASSETS): string[] {
  const bundled = ACTIVATION_RECEIPT_BUNDLED_ASSETS[key];
  const filename = key === 'logo' ? ACTIVATION_INVOICE_LOGO_FILENAME : ACTIVATION_RECEIPT_QR_FILENAME;

  const candidates: string[] = [];
  if (bundled) {
    candidates.push(resolveAbsoluteAssetUrl(bundled, appOrigin));
  }
  const publicCandidates = activationReceiptStaticAssetUrlCandidates(appOrigin, filename);
  for (let i = 0; i < publicCandidates.length; i++) {
    candidates.push(publicCandidates[i]);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/**
 * يحمّل صور الوصل (Webpack + public) ويحوّلها إلى data URL لتظهر في الطباعة.
 */
export async function embedActivationReceiptStaticImages(
  appOrigin: string
): Promise<ActivationReceiptEmbeddedImages> {
  const origin =
    appOrigin ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const [logo, qr] = await Promise.all([
    fetchFirstImageAsDataUrl(bundledAssetUrlCandidates(origin, 'logo')),
    fetchFirstImageAsDataUrl(bundledAssetUrlCandidates(origin, 'qr')),
  ]);

  return {
    logo: logo || resolveAbsoluteAssetUrl(ACTIVATION_RECEIPT_BUNDLED_ASSETS.logo, origin),
    qr: qr || resolveAbsoluteAssetUrl(ACTIVATION_RECEIPT_BUNDLED_ASSETS.qr, origin),
  };
}

/** كتابة مستند الطباعة في iframe مخفي (نفس سياق الصفحة) ثم الطباعة. */
export async function openActivationReceiptPrintWindow(html: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'activation-receipt-print');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
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

  await waitForDocumentImages(printDoc);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  printWin.focus();
  printWin.print();

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };
  if (typeof printWin.onafterprint !== 'undefined') {
    printWin.onafterprint = cleanup;
  } else {
    setTimeout(cleanup, 2000);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type InvoiceLogoResolveOptions = { appOrigin: string; apiBaseUrl?: string };

/**
 * روابط مطلقة محتملة للشعار (نفس المضيف قد يعرض الملفات تحت بادئة التطبيق مثل /wakeel/uploads وليس /uploads فقط).
 */
export function resolveInvoiceLogoUrlCandidates(
  logoUrl: string | null | undefined,
  options: InvoiceLogoResolveOptions
): string[] {
  const u = (logoUrl ?? '').trim();
  if (!u) return [];
  if (u.startsWith('data:')) return [u];
  if (/^https?:\/\//i.test(u)) {
    const apiBase = options.apiBaseUrl?.trim();
    if (apiBase) {
      try {
        const abs = new URL(u);
        const apiRoot = apiBase.replace(/\/api(\/v\d+)?\/?$/i, '').replace(/\/$/, '');
        if (apiRoot) {
          const rootParsed = new URL(apiRoot.endsWith('/') ? apiRoot : `${apiRoot}/`);
          const prefix = rootParsed.pathname.replace(/\/$/, '') || '';
          if (
            abs.origin === rootParsed.origin &&
            abs.pathname.startsWith('/uploads/') &&
            prefix &&
            !abs.pathname.startsWith(`${prefix}/`)
          ) {
            return [`${apiRoot}${abs.pathname}${abs.search}${abs.hash}`];
          }
        }
      } catch {
        /* keep as-is */
      }
    }
    return [u];
  }
  if (u.startsWith('//')) {
    const proto = typeof window !== 'undefined' ? window.location.protocol : 'https:';
    return [`${proto}${u}`];
  }

  const raw = (options.apiBaseUrl?.trim() || options.appOrigin || '').replace(/\/$/, '');
  let originHost = options.appOrigin.replace(/\/$/, '');
  let pathPrefix = '';
  try {
    const parsed = new URL(raw);
    originHost = parsed.origin;
    let pathname = parsed.pathname.replace(/\/$/, '');
    pathname = pathname.replace(/\/api(\/v\d+)?$/i, '');
    pathPrefix = pathname && pathname !== '/' ? pathname : '';
  } catch {
    /* keep originHost from appOrigin */
  }

  const apiBase = options.apiBaseUrl?.replace(/\/$/, '');
  const apiStaticRoot = apiBase ? apiBase.replace(/\/api(\/v\d+)?\/?$/i, '').replace(/\/$/, '') : '';
  const out: string[] = [];

  if (u.startsWith('/')) {
    const pfx = pathPrefix.replace(/\/$/, '');
    if (pfx) {
      if (u === pfx || u.startsWith(`${pfx}/`)) {
        out.push(`${originHost}${u}`);
      } else {
        out.push(`${originHost}${pathPrefix}${u}`);
      }
    }
    if (apiStaticRoot) {
      if (u.startsWith('/uploads/') && apiStaticRoot === originHost) {
        out.push(`${originHost}/wakeel${u}`);
      }
      out.push(`${apiStaticRoot}${u}`);
    }
    if (!pathPrefix && u.startsWith('/uploads/')) {
      out.push(`${originHost}/wakeel${u}`);
    }
    out.push(`${originHost}${u}`);
  } else {
    out.push(`${originHost}/${u}`);
    if (pathPrefix) out.push(`${originHost}${pathPrefix}/${u}`);
  }

  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const x of out) {
    if (!seen.has(x)) {
      seen.add(x);
      uniq.push(x);
    }
  }
  return uniq;
}

export function resolveInvoiceLogoUrl(
  logoUrl: string | null | undefined,
  options: InvoiceLogoResolveOptions
): string | null {
  const c = resolveInvoiceLogoUrlCandidates(logoUrl, options);
  return c[0] ?? null;
}

export async function tryEmbedInvoiceLogoAsDataUrl(
  settings: ActivationInvoicePrintSettingsDto,
  options: InvoiceLogoResolveOptions
): Promise<ActivationInvoicePrintSettingsDto> {
  const raw = settings.logoUrl?.trim();
  if (!raw || raw.startsWith('data:')) return settings;

  const candidates = resolveInvoiceLogoUrlCandidates(raw, options).filter((u) => u && !u.startsWith('data:'));
  if (candidates.length === 0) return settings;

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;

  for (const absolute of candidates) {
    try {
      const res = await fetch(absolute, {
        mode: 'cors',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || blob.size === 0) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('read'));
        fr.readAsDataURL(blob);
      });
      return { ...settings, logoUrl: dataUrl };
    } catch {
      /* جرّب الرابط التالي */
    }
  }
  return settings;
}

export function waitForDocumentImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images);
  return Promise.all(
    imgs.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            })
    )
  ).then(() => undefined);
}

export type ActivationReceiptPrintPayload = {
  receiptNumber: string;
  renewalDate: string;
  subscriberName: string;
  subscriberPhone: string;
  newProfileName: string;
  newExpirationDate?: string | null;
  finalPrice: number;
  amountPaid: number;
  discountAmount?: number;
  discountPercent?: number;
  notes?: string | null;
  subscriberId?: string;
  remainingAmount?: number;
  /** اسم مستخدم المشترك على الشبكة */
  subscriberUsername?: string | null;
  /** كلمة مرور المشترك (أو wiFiCode من الاستجابة) */
  subscriberPassword?: string | null;
  /** طريقة الدفع — Card / Wallet / كاش */
  paymentMethod?: string | null;
  agentPhone?: string | null;
  agentAddress?: string | null;
  agentCompanyName?: string | null;
  /** من قام بالتفعيل (اسم المستخدم من الخادم إن وُجد) */
  organizerName?: string | null;
};

export type ActivationReceiptPasswordContext = {
  serviceType?: ServiceType | number | null;
  resellerName?: string | null;
  agentCompanyName?: string | null;
};

function isBlankReceiptPassword(value?: string | null): boolean {
  const v = (value ?? '').trim();
  return v === '' || v === '—' || v === '-' || v === '–';
}

/** هل سياق الطباعة لفواتير SAS — Blue TI؟ */
export function isSasBlueTiInvoiceContext(ctx?: ActivationReceiptPasswordContext | null): boolean {
  if (!ctx) return false;
  const haystack = `${ctx.resellerName ?? ''} ${ctx.agentCompanyName ?? ''}`.trim().toLowerCase();
  const nameMatchesBlueTi = /blue\s*ti|blueti|blue\s*t\s*i/.test(haystack);
  if (!nameMatchesBlueTi) return false;
  const st = ctx.serviceType;
  if (st == null) return nameMatchesBlueTi;
  return Number(st) === ServiceType.Sas;
}

export function resolveActivationReceiptSubscriberPassword(
  payload: ActivationReceiptPrintPayload,
  _ctx?: ActivationReceiptPasswordContext | null
): string {
  const existing = (payload.subscriberPassword ?? '').trim();
  if (!isBlankReceiptPassword(existing)) return existing;
  return SAS_BLUE_TI_RECEIPT_PASSWORD;
}

function pickStringFromRecord(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return '';
}

export function pickOrganizerNameFromRenewalLike(r: Record<string, unknown>): string {
  return pickStringFromRecord(r, [
    'organizerName',
    'OrganizerName',
    'employeeName',
    'EmployeeName',
    'employeeFullName',
    'EmployeeFullName',
    'activatedByFullName',
    'ActivatedByFullName',
    'createdByFullName',
    'CreatedByFullName',
    'executedByFullName',
    'ExecutedByFullName',
    'issuerDisplayName',
    'IssuerDisplayName',
    'performedByName',
    'PerformedByName',
    'issuerName',
    'IssuerName',
    'activatedByUserName',
    'ActivatedByUserName',
    'createdByUserName',
    'CreatedByUserName',
    'issuedByUserName',
    'IssuedByUserName',
  ]);
}

/** اسم من قام بالتفعيل/الطباعة — الاسم الكامل يُفضَّل على اسم المستخدم */
export function resolveCurrentUserOrganizerDisplayName(
  user?: { fullName?: string | null; username?: string | null } | null
): string | undefined {
  const fullName = (user?.fullName ?? '').trim();
  if (fullName) return fullName;
  const username = (user?.username ?? '').trim();
  return username || undefined;
}

function pickSubscriberPasswordFromRenewalLike(r: Record<string, unknown>): string {
  return pickStringFromRecord(r, [
    'subscriberPassword',
    'SubscriberPassword',
    'password',
    'Password',
    'wiFiCode',
    'WiFiCode',
    'wifiCode',
  ]);
}

export function formatActivationReceiptPaymentMethod(raw?: string | null): string {
  if (raw == null || String(raw).trim() === '') return 'كاش';
  const v = String(raw).trim();
  const lower = v.toLowerCase();
  if (lower === 'card') return 'بطاقة دفع';
  if (lower === 'wallet') return 'محفظة الرصيد';
  if (lower === 'cash') return 'كاش';
  return v;
}

/** تاريخ بصيغة YYYY/MM/DD */
export function formatActivationReceiptShortDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  return formatDisplayDate(value);
}

export function renewalLikeToActivationPrintPayload(r: Record<string, unknown>): ActivationReceiptPrintPayload {
  const fp = Number(r.finalPrice ?? 0);
  const ap = Number(r.amountPaid ?? 0);
  const rem = r.remainingAmount != null && r.remainingAmount !== '' ? Number(r.remainingAmount) : undefined;
  const organizerName = pickOrganizerNameFromRenewalLike(r);
  const subscriberUsername = pickStringFromRecord(r, [
    'subscriberUsername',
    'SubscriberUsername',
    'username',
    'Username',
    'deviceUsername',
    'DeviceUsername',
  ]);
  return {
    receiptNumber: String(r.receiptNumber ?? ''),
    renewalDate: String(r.renewalDate ?? r.issueDate ?? r.createdAt ?? ''),
    subscriberName: String(r.subscriberName ?? ''),
    subscriberPhone: String(r.subscriberPhone ?? r.phoneNumber ?? r.PhoneNumber ?? ''),
    newProfileName: String(r.newProfileName ?? r.profileName ?? ''),
    newExpirationDate: r.newExpirationDate != null ? String(r.newExpirationDate) : null,
    finalPrice: fp,
    amountPaid: ap,
    discountAmount: r.discountAmount != null ? Number(r.discountAmount) : 0,
    discountPercent: r.discountPercent != null ? Number(r.discountPercent) : 0,
    notes: r.notes != null ? String(r.notes) : null,
    subscriberId: r.subscriberId != null ? String(r.subscriberId) : undefined,
    remainingAmount: rem != null && !Number.isNaN(rem) ? rem : undefined,
    organizerName: organizerName || undefined,
    subscriberUsername: subscriberUsername || undefined,
    subscriberPassword: pickSubscriberPasswordFromRenewalLike(r) || undefined,
    paymentMethod:
      (r.paymentMethod ?? r.PaymentMethod ?? null) != null
        ? String(r.paymentMethod ?? r.PaymentMethod)
        : undefined,
    agentPhone: pickStringFromRecord(r, ['agentPhone', 'AgentPhone']) || undefined,
    agentAddress: pickStringFromRecord(r, ['agentAddress', 'AgentAddress']) || undefined,
    agentCompanyName: pickStringFromRecord(r, ['agentCompanyName', 'AgentCompanyName']) || undefined,
  };
}

export type ActivationReceiptSubscriberContext = {
  username?: string | null;
  deviceUsername?: string | null;
  paymentMethod?: string | null;
  password?: string | null;
} & ActivationReceiptPasswordContext;

/** يكمّل بيانات الطباعة من سجل المشترك المحلي عند غيابها في استجابة التفعيل */
export function enrichActivationPrintPayload(
  payload: ActivationReceiptPrintPayload,
  context?: ActivationReceiptSubscriberContext | null
): ActivationReceiptPrintPayload {
  const passwordCtx: ActivationReceiptPasswordContext = {
    serviceType: context?.serviceType,
    resellerName: context?.resellerName,
    agentCompanyName: context?.agentCompanyName ?? payload.agentCompanyName,
  };

  if (!context) {
    return {
      ...payload,
      subscriberPassword: resolveActivationReceiptSubscriberPassword(payload, passwordCtx),
    };
  }

  const username =
    (payload.subscriberUsername ?? '').trim() ||
    (context.deviceUsername ?? '').trim() ||
    (context.username ?? '').trim();
  const password =
    (payload.subscriberPassword ?? '').trim() || (context.password ?? '').trim();
  const paymentMethod =
    (payload.paymentMethod ?? '').trim() || (context.paymentMethod ?? '').trim() || undefined;

  const merged: ActivationReceiptPrintPayload = {
    ...payload,
    subscriberUsername: username || payload.subscriberUsername,
    subscriberPassword: password || payload.subscriberPassword,
    paymentMethod: paymentMethod ?? payload.paymentMethod,
  };

  return {
    ...merged,
    subscriberPassword: resolveActivationReceiptSubscriberPassword(merged, passwordCtx),
  };
}

/**
 * مستند HTML كامل لوصل التفعيل — POS 80mm، خط رسمي أسود.
 */
export function buildActivationReceiptPrintHtml(
  settings: ActivationInvoicePrintSettingsDto,
  receipt: ActivationReceiptPrintPayload,
  opts: {
    formatDate: (d: string | Date, options?: Intl.DateTimeFormatOptions) => string;
    locale: string;
    appOrigin: string;
    /** الاسم الكامل لمن قام بالتفعيل/الطباعة — يُفضَّل على organizerName من الخادم */
    fallbackOrganizerName?: string;
    /** صور مضمّنة (data URL) — يُفضَّل عند الطباعة */
    embeddedImages?: ActivationReceiptEmbeddedImages;
  }
): string {
  const { locale, appOrigin, fallbackOrganizerName, embeddedImages } = opts;
  const fmtNum = (n: number) => n.toLocaleString(locale);

  const borrowNote =
    settings.footerLegalText?.trim() || DEFAULT_ACTIVATION_RECEIPT_BORROW_DAY_NOTE;
  const companyAddress =
    settings.companyAddress?.trim() ||
    receipt.agentAddress?.trim() ||
    'الحمدانية – شارع الحزام – قرب كنيسة مار بهنام واخته سارة';
  const companyPhones =
    settings.companyPhones?.trim() || receipt.agentPhone?.trim() || '07723775772';

  const logoSrc =
    embeddedImages?.logo?.trim() ||
    getActivationInvoiceStaticAssetUrl(appOrigin, ACTIVATION_INVOICE_LOGO_FILENAME);
  const qrSrc =
    embeddedImages?.qr?.trim() ||
    getActivationInvoiceStaticAssetUrl(appOrigin, ACTIVATION_RECEIPT_QR_FILENAME);

  const phoneIconSvg = `<svg class="inline-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.07 21 3 13.93 3 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.24 1.01l-2.2 2.2z"/></svg>`;
  const locationIconSvg = `<svg class="inline-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>`;

  const issueDateStr = formatActivationReceiptShortDate(receipt.renewalDate);
  const expiryStr = formatActivationReceiptShortDate(receipt.newExpirationDate ?? '');
  const subscriptionAmount = receipt.finalPrice > 0 ? receipt.finalPrice : receipt.amountPaid;
  const paymentLabel = formatActivationReceiptPaymentMethod(receipt.paymentMethod);

  const activator = (
    (fallbackOrganizerName != null ? String(fallbackOrganizerName) : '') ||
    (receipt.organizerName != null ? String(receipt.organizerName) : '')
  ).trim();

  const username = (receipt.subscriberUsername ?? '').trim() || '—';
  const password = resolveActivationReceiptSubscriberPassword(receipt);

  const fieldRow = (label: string, value: string) =>
    `<div class="field-row"><span class="field-label">${escapeHtml(label)}</span><span class="field-value">${escapeHtml(value)}</span></div>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=80mm, initial-scale=1">
  <title>وصل تفعيل — ${escapeHtml(receipt.receiptNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    @page {
      size: 80mm auto;
      margin: 1mm;
    }

    body {
      margin: 0;
      font-family: "Noto Naskh Arabic", Tahoma, "Segoe UI", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.45;
      color: #000;
      background: #f0f0f0;
      direction: rtl;
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
      padding: 12px 0;
      display: flex;
      justify-content: center;
    }

    .paper {
      width: 80mm;
      max-width: 80mm;
      background: #fff;
      padding: 2mm 2.5mm 3mm;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.15);
    }

    .logo {
      display: block;
      width: auto;
      max-width: 46mm;
      max-height: 14mm;
      height: auto;
      margin: 0 auto 1.5mm;
      object-fit: contain;
      object-position: center center;
    }

    .receipt-top {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-start;
      gap: 2mm;
      direction: ltr;
      margin-bottom: 2mm;
      width: 100%;
    }

    .meta-block {
      flex: 1 1 auto;
      min-width: 0;
      text-align: left;
    }

    .meta-line {
      font-size: 9.5px;
      font-weight: 600;
      color: #000;
      line-height: 1.45;
      font-family: Tahoma, Arial, sans-serif;
    }

    .credentials {
      flex: 0 0 auto;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.5;
      text-align: right;
      color: #000;
      white-space: nowrap;
      font-family: Tahoma, "Noto Naskh Arabic", Arial, sans-serif;
    }

    .field-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.35rem;
      margin: 1.6mm 0;
      font-size: 11px;
      font-weight: 600;
      color: #000;
      text-align: right;
    }

    .field-label {
      flex: 0 0 auto;
      font-weight: 700;
    }

    .field-value {
      flex: 1 1 0;
      min-width: 0;
      word-break: break-word;
      font-weight: 600;
    }

    .activator-row {
      margin: 2.5mm 0 1.5mm;
      font-size: 10.5px;
      font-weight: 700;
      text-align: right;
      color: #000;
    }

    .legal-note {
      margin: 2.5mm 0;
      font-size: 8.5px;
      font-weight: 700;
      line-height: 1.5;
      text-align: center;
      color: #ff0000;
    }

    .qr-intro {
      margin: 2mm 0 1.5mm;
      font-size: 9px;
      font-weight: 600;
      text-align: center;
      line-height: 1.45;
      color: #000;
    }

    .qr-block {
      display: flex;
      justify-content: center;
      margin: 1mm 0 2.5mm;
    }

    .qr-img {
      width: 20mm;
      height: 20mm;
      object-fit: contain;
    }

    .contact-line {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 1.2mm;
      margin: 1.2mm 0;
      text-align: center;
      color: #000;
    }

    .contact-line .contact-text {
      font-size: 10px;
      font-weight: 600;
      line-height: 1.4;
      word-break: break-word;
    }

    .contact-line.phone-line .contact-text {
      font-size: 11px;
      font-weight: 700;
      direction: ltr;
      unicode-bidi: embed;
      font-family: Tahoma, Arial, sans-serif;
      letter-spacing: 0.02em;
    }

    .inline-icon {
      width: 3.2mm;
      height: 3.2mm;
      min-width: 3.2mm;
      min-height: 3.2mm;
      flex-shrink: 0;
      fill: #000;
      display: block;
    }

    .footer-legal {
      margin-top: 2mm;
      font-size: 7px;
      font-weight: 500;
      text-align: center;
      color: #444;
      line-height: 1.35;
    }

    @media print {
      body {
        background: #fff;
        padding: 0;
        display: block;
      }

      .paper {
        box-shadow: none;
        margin: 0 auto;
        width: 80mm;
        max-width: 80mm;
      }
    }
  </style>
</head>
<body>
  <div class="paper">
    <img src="${escapeHtml(logoSrc)}" class="logo" alt="" />
    <div class="receipt-top">
      <div class="meta-block">
        <div class="meta-line">Date: ${escapeHtml(issueDateStr || '—')}</div>
        <div class="meta-line">No: ${escapeHtml(receipt.receiptNumber || '—')}</div>
      </div>
      <div class="credentials">Username&nbsp;: ${escapeHtml(username)}<br/>Password&nbsp;: ${escapeHtml(password)}</div>
    </div>
    ${fieldRow('اسم المشترك:', receipt.subscriberName || '—')}
    ${fieldRow('فئة الاشتراك:', receipt.newProfileName || '—')}
    ${fieldRow('مبلغ الاشتراك:', `${fmtNum(subscriptionAmount)}`)}
    ${fieldRow('تاريخ انتهاء الاشتراك:', expiryStr || '—')}
    ${fieldRow('طريقة الدفع', `: ${paymentLabel}`)}
    <div class="activator-row">المفعل : ${escapeHtml(activator || '—')}</div>
    <div class="legal-note">${escapeHtml(borrowNote)}</div>
    <div class="qr-intro">للمزيد من المعلومات يمكن الاتصال على الارقام التالية او عبر مسح رمز الـ QR</div>
    <div class="qr-block">
      <img src="${escapeHtml(qrSrc)}" class="qr-img" alt="QR" />
    </div>
    <div class="contact-line phone-line">
      ${phoneIconSvg}
      <span class="contact-text">${escapeHtml(companyPhones)}</span>
    </div>
    <div class="contact-line address-line">
      ${locationIconSvg}
      <span class="contact-text">${escapeHtml(companyAddress)}</span>
    </div>
    <div class="footer-legal">${escapeHtml(DEFAULT_INVOICE_PRINT_FOOTER_LEGAL)}</div>
  </div>
</body>
</html>`;
}
