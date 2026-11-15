import type { Metadata } from 'next';
import AdminDashboard from './admin-dashboard';
export const metadata: Metadata = { title: 'Admin dashboard | MAU Connect', robots: { index: false, follow: false } };
export default function AdminPage() { return <AdminDashboard />; }
