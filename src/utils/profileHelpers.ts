/** Build display name from first_name + last_name, fallback to email. */
export function getDisplayName(
  profile: { first_name?: string | null; last_name?: string | null; email?: string | null },
): string {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  return name || profile.email || '';
}
