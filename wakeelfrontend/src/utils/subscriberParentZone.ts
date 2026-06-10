/** يزيل بادئة التاريخ من parent_username SAS، مثل (2024-11-19)HMR01@Zone */
export function formatSasParentZone(parentUsername?: string | null): string {
  const raw = (parentUsername ?? '').trim();
  if (!raw) return '';
  return raw.replace(/^\(\d{4}-\d{2}-\d{2}\)/, '').trim() || raw;
}
