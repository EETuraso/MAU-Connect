export type Listing={id:string;seller_id:string;title:string;description:string;price:number;negotiable:boolean;category:string;location:string;condition:string;images:string[];status:string;created_at:string;};
export const categories=['All categories','Phones & Tablets','Electronics','Fashion','Home & Living','Vehicles','Property','Beauty & Care','Sports & Outdoors'];
const photo=(id:string)=>`https://images.unsplash.com/${id}?auto=format&fit=crop&w=700&q=85`;
export const seed:Listing[]=[
 ['iPhone 13 Pro • 256GB',485000,'Phones & Tablets','Lagos, Ikeja','Used','photo-1632633173522-8a3c3ce7ca57',true],
 ['Modern accent chair',75000,'Home & Living','Abuja, Wuse','New','photo-1567538096630-e0c55bd6374c',true],
 ['MacBook Air M1 • 256GB',620000,'Electronics','Lagos, Lekki','Used','photo-1517336714731-489689fd1ca8',false],
 ['Nike Air Force 1',42000,'Fashion','Yola, Adamawa','New','photo-1549298916-b41d501d3772',false],
 ['Sony WH-1000XM4 headphones',165000,'Electronics','Abuja, Gwarinpa','Used','photo-1546435770-a3e426bf472b',true],
 ['Everyday leather backpack',28000,'Fashion','Lagos, Surulere','New','photo-1553062407-98eeb64c6a62',false],
 ['Canon EOS camera kit',310000,'Electronics','Port Harcourt, Rivers','Used','photo-1516035069371-29a1b244cc32',true],
 ['Minimal oak side table',55000,'Home & Living','Yola, Adamawa','New','photo-1499933374294-4584851497cc',true]
].map((r,i)=>({id:`demo-${i}`,seller_id:i<4?'demo-seller':'demo-other',title:String(r[0]),price:Number(r[1]),category:String(r[2]),location:String(r[3]),condition:String(r[4]),images:[photo(String(r[5]))],negotiable:Boolean(r[6]),description:'Well cared for and ready for a new home. Contact the seller for more details, availability, and collection arrangements.',status:'active',created_at:new Date(2026,9,28-i).toISOString()}));
export const defaults={site_name:'MAU Connect',hero_title:'Great finds.\nCloser connections.',hero_subtitle:'Buy what you love. Sell what you don’t. Connect with people across Nigeria.',payment_mode:'seller',payment_instructions:'',categories:categories.slice(1)};
