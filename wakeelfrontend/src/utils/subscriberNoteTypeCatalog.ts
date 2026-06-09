import { SubscriberNoteType, SubscriberNoteTypeOption } from '../types';
import { SUBSCRIBER_NOTE_TYPE_LABEL_AR } from './subscriberNoteTypeLabels';

export function noteTypeRequiresFreeText(
  noteType: number | null | undefined,
  catalog?: SubscriberNoteTypeOption[]
): boolean {
  if (noteType == null) return false;
  const fromCatalog = catalog?.find((o) => o.value === noteType);
  if (fromCatalog != null) return !!fromCatalog.requiresNoteText;
  return noteType === SubscriberNoteType.Other;
}

export function labelFromSubscriberNoteTypeCatalog(
  noteType: number | null | undefined,
  catalog?: SubscriberNoteTypeOption[],
  note?: string | null
): string {
  const hasFreeNote = !!(note ?? '').toString().trim();
  if (!noteType) {
    return hasFreeNote
      ? (catalog?.find((o) => o.requiresNoteText)?.label ??
          SUBSCRIBER_NOTE_TYPE_LABEL_AR[SubscriberNoteType.Other])
      : '—';
  }
  const fromCatalog = catalog?.find((o) => o.value === noteType)?.label;
  if (fromCatalog) return fromCatalog;
  return SUBSCRIBER_NOTE_TYPE_LABEL_AR[noteType as SubscriberNoteType] ?? String(noteType);
}

export function getSubscriberLocalNoteWithCatalog(
  subscriber: { noteType?: SubscriberNoteType | number | null; note?: string | null },
  catalog?: SubscriberNoteTypeOption[]
): string {
  const text = (subscriber.note ?? '').toString().trim();
  if (noteTypeRequiresFreeText(subscriber.noteType ?? null, catalog)) return text;
  if (!subscriber.noteType && text) return text;
  return '';
}
