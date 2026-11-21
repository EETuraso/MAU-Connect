import type { Metadata } from 'next';
import ResourcePage from '../resource-page';
export const metadata: Metadata = { title: 'Handouts | MAU Connect' };
export default function HandoutsPage() { return <ResourcePage kind="handouts" />; }
