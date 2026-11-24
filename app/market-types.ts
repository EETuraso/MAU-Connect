export type Listing = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  negotiable: boolean;
  category: string;
  location: string;
  condition: string;
  images: string[];
  status: string;
  created_at: string;
};
export const defaults = {
  site_name: 'MAU Connect',
  hero_title: 'Great finds.\nCloser connections.',
  hero_subtitle: 'Buy what you love. Sell what you don’t. Connect with people across Nigeria.',
  payment_mode: 'seller',
  payment_instructions: '',
  categories: ['Phones & Tablets', 'Electronics', 'Fashion', 'Home & Living', 'Vehicles', 'Property', 'Beauty & Care', 'Sports & Outdoors'],
};
export type Settings = typeof defaults;
export type Profile = {
  id: string;
  name: string;
  role: 'seller' | 'admin';
  phone: string;
  payment_method: string;
  payment_instructions: string;
  suspended: boolean;
  created_at?: string;
};
export type AuditEntry = {
  id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown> & { id?: string; reason?: string };
};
export type Report = {
  id: string;
  listing_id: string | null;
  reason: string;
  status: string;
  created_at?: string | null;
};
export type PastQuestion = {
  id: string;
  title: string;
  course: string;
  level: string;
  year: number;
  file_url: string;
  created_at: string;
};
export type Handout = {
  id: string;
  title: string;
  course: string;
  description: string;
  file_url: string;
  created_at: string;
};
export type MarketResponse = {
  registered_count?: number | null;
  listings: Listing[];
  past_questions: PastQuestion[];
  handouts: Handout[];
  settings: Settings;
  user: Profile | null;
  users: Profile[];
  audit: AuditEntry[];
  reports: Report[];
};
