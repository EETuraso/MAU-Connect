import Link from 'next/link';
import type { Metadata } from 'next';
import ResetForm from './reset-form';
export const metadata: Metadata = { title: 'Reset password | MAU Connect' };
export default function ResetPasswordPage() { return <ResetForm />; }
