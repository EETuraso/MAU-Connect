import type { Metadata } from 'next';
import './globals.css';
import VisitorTracker from './visitor-tracker';
export const metadata: Metadata = {title:'MAU Connect | Find your next great deal',description:'Buy and sell with people across Nigeria. Your next great find is closer than you think.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><VisitorTracker/>{children}</body></html>}
