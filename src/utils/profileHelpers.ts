/** Fallback name shown for deleted users. */
export const DELETED_USER_NAME = 'Ehemaliger Teilnehmer';

/** Build display name from first_name + last_name, fallback to email. */
export function getDisplayName(
  profile: { first_name?: string | null; last_name?: string | null; email?: string | null },
): string {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  return name || profile.email || '';
}

/** "Max M." — Vorname + erster Buchstabe Nachname */
export function getShortName(
  profile: { first_name?: string | null; last_name?: string | null; email?: string | null },
): string {
  const first = profile.first_name?.trim();
  const last = profile.last_name?.trim();
  if (first && last) return `${first} ${last.charAt(0)}.`;
  if (first) return first;
  return profile.email?.split('@')[0] || 'Unbekannt';
}
