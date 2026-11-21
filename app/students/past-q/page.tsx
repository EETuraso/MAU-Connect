import type { Metadata } from 'next';
import ResourcePage from '../resource-page';
export const metadata: Metadata = { title: 'Past Question Papers | MAU Connect' };
export default function PastQuestionsPage() { return <ResourcePage kind="past" />; }
