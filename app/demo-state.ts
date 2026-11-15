import type { defaults, Listing } from './data';

type DemoUser = {
  id: string;
  name: string;
  role: string;
  phone: string;
  payment_method: string;
  payment_instructions: string;
  suspended: boolean;
};
type Settings = typeof defaults;
type AuditEntry = {
  id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown> & { id?: string; reason?: string };
};
type Report = { id: string; listing_id: string; reason: string; status: string };
type DemoState = {
  items: Listing[];
  settings: Settings;
  users: DemoUser[];
  audit: AuditEntry[];
  reports: Report[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hasStrings = (value: Record<string, unknown>, fields: string[]) =>
  fields.every(field => typeof value[field] === 'string');
const isString = (value: unknown): value is string => typeof value === 'string';

function isListing(value: unknown): value is Listing {
  return isRecord(value)
    && hasStrings(value, ['id', 'seller_id', 'title', 'description', 'category', 'location', 'condition', 'status', 'created_at'])
    && typeof value.price === 'number' && Number.isFinite(value.price)
    && typeof value.negotiable === 'boolean'
    && Array.isArray(value.images) && value.images.length > 0 && value.images.every(isString);
}

function isUser(value: unknown): value is DemoUser {
  return isRecord(value)
    && hasStrings(value, ['id', 'name', 'role', 'phone', 'payment_method', 'payment_instructions'])
    && typeof value.suspended === 'boolean';
}

function isSettings(value: unknown): value is Settings {
  return isRecord(value)
    && hasStrings(value, ['site_name', 'hero_title', 'hero_subtitle', 'payment_instructions'])
    && (value.payment_mode === 'seller' || value.payment_mode === 'platform')
    && Array.isArray(value.categories) && value.categories.every(isString);
}

function isAuditEntry(value: unknown): value is AuditEntry {
  return isRecord(value) && hasStrings(value, ['id', 'action', 'created_at'])
    && isRecord(value.details)
    && (value.details.id === undefined || isString(value.details.id))
    && (value.details.reason === undefined || isString(value.details.reason));
}

function isReport(value: unknown): value is Report {
  return isRecord(value) && hasStrings(value, ['id', 'listing_id', 'reason', 'status']);
}

// Browser storage can contain older data or valid JSON with the wrong shape.
// Keep usable records while preventing malformed values from reaching render.
export function restoreDemoState(value: unknown, fallback: DemoState): DemoState {
  if (!isRecord(value)) return fallback;
  return {
    items: Array.isArray(value.items) ? value.items.filter(isListing) : fallback.items,
    settings: isSettings(value.settings) ? value.settings : fallback.settings,
    users: Array.isArray(value.users) ? value.users.filter(isUser) : fallback.users,
    audit: Array.isArray(value.audit) ? value.audit.filter(isAuditEntry) : fallback.audit,
    reports: Array.isArray(value.reports) ? value.reports.filter(isReport) : fallback.reports,
  };
}

export function restoreSavedIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isString) : [];
}

export function getDemoSeller(users: DemoUser[], fallback: DemoUser): DemoUser {
  return users.find(user => user.id === fallback.id) ?? fallback;
}
