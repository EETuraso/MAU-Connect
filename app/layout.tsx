import type { Metadata } from 'next';
import './globals.css';
import './theme.css';
import VisitorTracker from './visitor-tracker';
import ThemeProvider from '../components/theme-provider';
import ThemeToggle from '../components/theme-toggle';
export const metadata: Metadata = {title:'MAU Connect | Find your next great deal',description:'Buy and sell with people across Nigeria. Your next great find is closer than you think.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body><ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange><VisitorTracker/><ThemeToggle/>{children}</ThemeProvider></body></html>}
