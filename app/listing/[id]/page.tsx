import type { Metadata } from 'next';
import Link from 'next/link';

type Listing = { id: string; title: string; description: string; price: number; images: string[]; status: string };
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function getListing(id: string): Promise<Listing | null> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !idPattern.test(id)) return null;
  try {
    const response = await fetch(`${url}/rest/v1/listings?id=eq.${id}&status=eq.active&select=id,title,description,price,images,status`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json() as Listing[];
    return data[0] || null;
  } catch { return null; }
}
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const item = await getListing(id);
  if (!item) return { title: 'Listing unavailable | MAU Connect' };
  const description = `₦${Number(item.price).toLocaleString('en-NG')} · ${item.description}`.slice(0, 200);
  return { title: `${item.title} | MAU Connect`, description, openGraph: { title: item.title, description, images: item.images?.[0] ? [{ url: item.images[0] }] : [] }, twitter: { card: 'summary_large_image', title: item.title, description, images: item.images?.[0] ? [item.images[0]] : [] } };
}
export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getListing(id);
  if (!item) return <main><h1>Listing unavailable</h1><p>This listing may have been removed or is temporarily unavailable.</p><Link href="/">Back to marketplace</Link></main>;
  return <main><h1>{item.title}</h1><p>₦{Number(item.price).toLocaleString('en-NG')}</p>{item.images?.[0] && <img src={item.images[0]} alt={item.title} style={{maxWidth:'100%',maxHeight:420,objectFit:'contain'}}/>}<p>{item.description}</p><Link href={`/?listing=${encodeURIComponent(id)}`}>View all photos and contact the seller</Link></main>;
}
