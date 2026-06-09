import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Subscriber, SubscriberNoteType, SubscriberNoteTypeOption } from '../types';
import {
  labelFromSubscriberNoteTypeCatalog,
  noteTypeRequiresFreeText,
} from '../utils/subscriberNoteTypeCatalog';

interface AddNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscriber: Subscriber;
  noteTypeOptions?: SubscriberNoteTypeOption[];
  onSave: (id: string, noteType: SubscriberNoteType | null, note: string) => Promise<void>;
}

const AddNoteModal: React.FC<AddNoteModalProps> = ({
  isOpen,
  onClose,
  subscriber,
  noteTypeOptions = [],
  onSave,
}) => {
  const defaultType =
    subscriber.noteType ??
    (((subscriber.note || '').toString().trim().length > 0)
      ? SubscriberNoteType.Other
      : (noteTypeOptions[0]?.value as SubscriberNoteType | undefined) ?? SubscriberNoteType.NoResponse);

  const [noteType, setNoteType] = useState<SubscriberNoteType | null>(defaultType);
  const [note, setNote] = useState(subscriber.note || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNoteType(
        subscriber.noteType ??
        (((subscriber.note || '').toString().trim().length > 0)
          ? SubscriberNoteType.Other
          : (noteTypeOptions[0]?.value as SubscriberNoteType | undefined) ?? SubscriberNoteType.NoResponse)
      );
      setNote(subscriber.note || '');
    }
  }, [isOpen, subscriber, noteTypeOptions]);

  const requiresText = noteTypeRequiresFreeText(noteType, noteTypeOptions);

  const handleNoteTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const next = val === '' ? null : (parseInt(val, 10) as SubscriberNoteType);
    setNoteType(next);
    if (!noteTypeRequiresFreeText(next, noteTypeOptions)) setNote('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (noteTypeRequiresFreeText(noteType, noteTypeOptions)) {
      const trimmed = (note || '').toString().trim();
      if (!trimmed) return;
    }
    setIsSaving(true);
    try {
      await onSave(
        subscriber.id,
        noteType,
        noteTypeRequiresFreeText(noteType, noteTypeOptions) ? (note || '').trim() : ''
      );
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const options =
    noteTypeOptions.length > 0
      ? noteTypeOptions.filter((o) => o.isActive !== false)
      : [
          { value: SubscriberNoteType.NoResponse, label: 'لم يتم الرد' },
          { value: SubscriberNoteType.DoesNotWantActivation, label: 'لايرغب بالتفعيل' },
          { value: SubscriberNoteType.MaintenanceRequest, label: 'طلب صيانة' },
          { value: SubscriberNoteType.StableService, label: 'الخدمة مستقرة' },
          { value: SubscriberNoteType.Other, label: 'أخرى', requiresNoteText: true },
        ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ادخال ملاحظة</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{subscriber.fullName}</p>
            {noteType != null && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                {labelFromSubscriberNoteTypeCatalog(noteType, noteTypeOptions, note)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              نوع الملاحظة
            </label>
            <select
              value={noteType ?? ''}
              onChange={handleNoteTypeChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {requiresText && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                نص الملاحظة
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                placeholder="اكتب الملاحظة..."
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSaving || (requiresText && !(note || '').trim())}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>حفظ</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddNoteModal;
