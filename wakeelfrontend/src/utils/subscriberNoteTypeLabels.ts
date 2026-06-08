import { SubscriberNoteType } from '../types';

/** تسميات أنواع ملاحظات المشترك المحلية (FastAPI — لا تُجلب من SAS). */
export const SUBSCRIBER_NOTE_TYPE_LABEL_AR: Record<SubscriberNoteType, string> = {
  [SubscriberNoteType.NoResponse]: 'لم يتم الرد',
  [SubscriberNoteType.DoesNotWantActivation]: 'لايرغب بالتفعيل',
  [SubscriberNoteType.MaintenanceRequest]: 'طلب صيانة',
  [SubscriberNoteType.StableService]: 'الخدمة مستقرة',
  [SubscriberNoteType.Other]: 'أخرى',
};

/** تسمية عربية لقيمة رقمية (API، Excel، …) ضمن 1–5 */
export function subscriberNoteTypeLabelAr(value: number): string | undefined {
  return SUBSCRIBER_NOTE_TYPE_LABEL_AR[value as SubscriberNoteType];
}

/** نص local_note للعرض — فقط عند «أخرى» أو legacy بدون نوع */
export function getSubscriberLocalNote(subscriber: {
  noteType?: SubscriberNoteType | null;
  note?: string | null;
}): string {
  const text = (subscriber.note ?? '').toString().trim();
  if (subscriber.noteType === SubscriberNoteType.Other) return text;
  if (!subscriber.noteType && text) return text;
  return '';
}
