import type { ActivatePaymentMethodOption } from '../types';

export const DEFAULT_ACTIVATE_PAYMENT_METHODS: ActivatePaymentMethodOption[] = [
  { id: 1, value: 1, label_ar: 'كاش', label_en: 'Cash' },
  { id: 2, value: 2, label_ar: 'ماستر كارد', label_en: 'Master Card' },
  { id: 3, value: 3, label_ar: 'POS جهاز', label_en: 'POS' },
];

export function normalizeActivatePaymentMethodOptions(raw: unknown): ActivatePaymentMethodOption[] {
  const list = Array.isArray(raw) ? raw : [];
  const normalized = list
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const o = row as Record<string, unknown>;
      const valueRaw = o.value ?? o.id;
      const value = Number(valueRaw);
      if (!Number.isFinite(value) || value < 1) return null;
      const id = Number(o.id ?? value);
      const option: ActivatePaymentMethodOption = {
        id: Number.isFinite(id) ? id : value,
        value,
        label_ar:
          typeof o.label_ar === 'string'
            ? o.label_ar
            : typeof o.labelAr === 'string'
              ? o.labelAr
              : undefined,
        label_en:
          typeof o.label_en === 'string'
            ? o.label_en
            : typeof o.labelEn === 'string'
              ? o.labelEn
              : undefined,
      };
      return option;
    })
    .filter((x): x is ActivatePaymentMethodOption => x != null);
  return normalized.length > 0 ? normalized : DEFAULT_ACTIVATE_PAYMENT_METHODS;
}

export function isValidActivatePaymentMethod(value: unknown): value is 1 | 2 | 3 {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3;
}

export function paymentMethodLabel(
  methods: ActivatePaymentMethodOption[],
  value?: number | null
): string {
  if (value == null) return '—';
  const match = methods.find((m) => (m.value ?? m.id) === value);
  return match?.label_ar || match?.label_en || String(value);
}
