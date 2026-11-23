'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  const multiple = images.length > 1;
  const move = (step: number) => setIndex(current => (current + step + images.length) % images.length);

  if (!images.length) return <div className="detail-gallery-empty">No photos available</div>;

  return <div className="detail-gallery" aria-label={`Photos of ${title}`}>
    <div className="detail-image"
      onTouchStart={event => { touchStart.current = event.touches[0].clientX; }}
      onTouchEnd={event => {
        if (touchStart.current === null || !multiple) return;
        const distance = event.changedTouches[0].clientX - touchStart.current;
        if (Math.abs(distance) > 50) move(distance < 0 ? 1 : -1);
        touchStart.current = null;
      }}>
      <img src={images[index]} alt={`${title}, photo ${index + 1} of ${images.length}`} />
      {multiple && <>
        <button type="button" className="gallery-arrow gallery-previous" aria-label="Previous photo" onClick={() => move(-1)}><ChevronLeft size={22}/></button>
        <button type="button" className="gallery-arrow gallery-next" aria-label="Next photo" onClick={() => move(1)}><ChevronRight size={22}/></button>
        <span className="gallery-count" aria-live="polite">{index + 1} / {images.length}</span>
      </>}
    </div>
    {multiple && <div className="gallery-thumbnails" aria-label="Choose a product photo">
      {images.map((src, photoIndex) => <button key={photoIndex} type="button" className={photoIndex === index ? 'gallery-thumbnail selected' : 'gallery-thumbnail'} aria-label={`View photo ${photoIndex + 1} of ${images.length}`} aria-pressed={photoIndex === index} onClick={() => setIndex(photoIndex)}>
        <img src={src} alt="" loading="lazy"/>
      </button>)}
    </div>}
  </div>;
}
