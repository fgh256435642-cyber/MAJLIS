import { useEffect, useRef } from 'react';
import { isValidHexColor } from '../utils/validation';

export function ProfileBanner({
  bannerUrl,
  profileColor,
  className = 'h-16',
}: {
  bannerUrl?: string;
  profileColor?: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (profileColor && isValidHexColor(profileColor)) {
      el.style.backgroundColor = profileColor;
    } else {
      el.style.removeProperty('background-color');
    }
  }, [profileColor]);

  return (
    <div
      ref={boxRef}
      className={`w-full overflow-hidden bg-accent relative shrink-0 ${className}`}
    >
      {bannerUrl && (
        <img
          src={bannerUrl}
          alt=""
          data-image-preview="true"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      )}
    </div>
  );
}
