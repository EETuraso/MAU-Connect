// Saved IDs are the only marketplace data persisted in this browser.
// Ignore malformed values from older versions or manually edited storage.
export function restoreSavedIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];
}
