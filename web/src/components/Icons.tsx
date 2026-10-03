import type { SVGProps } from 'react';

/**
 * Original hand-drawn style icons (wobbly paths, ink strokes). Not taken from the game.
 */
type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 28): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 32 32',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.1,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

export const HeartIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M16 27.5c-1.2-1.1-11.3-7.6-11.6-14.4C4.2 8.4 7.4 5.6 10.6 5.8c2.6.1 4.3 1.9 5.3 3.9 1-2.1 2.9-4 5.6-4 3.4.1 6.4 3 6.1 7.5-.4 6.6-10.4 13.3-11.6 14.3z" fill="var(--blood)" />
    <path d="M9.4 10.2c.6-1.3 1.7-1.9 2.8-1.8" stroke="var(--bone)" strokeWidth="1.6" />
  </svg>
);

export const DamageIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M24.8 4.6 13.3 16.4l2.4 2.5L27.3 7.3l.3-3-2.8.3z" fill="var(--bone-dim)" />
    <path d="M10.3 15.2 17 21.9M12.6 19.4l-6.4 6.3M8 23.9l-2.3 2.2 1.2 1.2 2.3-2.2" />
    <path d="M7.4 21.2l3.6 3.5" />
  </svg>
);

export const TearsIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M16.2 4.3c3.6 5.4 8.4 10.4 8.2 15.4-.2 4.6-3.9 8-8.4 8-4.6-.1-8.3-3.6-8.2-8.3.1-4.9 4.9-9.6 8.4-15.1z" fill="var(--tear)" />
    <path d="M12.2 19.4c-.1 2.1 1 3.6 2.6 4.3" stroke="var(--bone)" strokeWidth="1.6" />
  </svg>
);

export const RangeIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M16 4.5c6.4-.2 11.6 5 11.5 11.4-.1 6.3-5.2 11.4-11.6 11.5C9.6 27.5 4.4 22.2 4.6 15.9 4.8 9.6 9.8 4.6 16 4.5z" />
    <path d="M16.1 9.3c3.6 0 6.6 3 6.5 6.7 0 3.6-3 6.5-6.6 6.5-3.7-.1-6.5-3-6.5-6.6.1-3.7 3-6.6 6.6-6.6z" />
    <circle cx="16" cy="16" r="2" fill="currentColor" />
  </svg>
);

export const ShotSpeedIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M21.5 12.4c2.6.1 4.6 2.2 4.5 4.8-.1 2.5-2.2 4.4-4.7 4.3-2.6-.1-4.5-2.2-4.4-4.8.2-2.5 2.2-4.4 4.6-4.3z" fill="var(--tear)" />
    <path d="M4.3 13.2l9.6.4M3.6 17.3l10.9.1M5.1 21.3l8.6-.6" />
  </svg>
);

export const SpeedIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M9.3 5.8l5.4-.3.8 9.7 8.2 3.4c2.3.9 3 2.8 2.7 5.1l-17.7.4-.4-4.6c-.2-2.3.6-3.2 1.3-4.4l-.3-9.3z" fill="var(--wood-light)" />
    <path d="M8.6 24.5l17.5-.6M15.1 15.4l-2.6.9M15.4 18.1l-2.4.8" />
  </svg>
);

export const LuckIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M16 15.6c-3.8-.6-7.4-3.5-5.6-7 1.6-2.7 4.8-1.3 5.6.6.8-2 4.2-3.3 5.6-.6 1.6 3.4-1.9 6.4-5.6 7z" fill="var(--moss)" />
    <path d="M15.8 16.4c-.6 3.8-3.5 7.4-7 5.6-2.7-1.6-1.3-4.8.6-5.6-2-.8-3.3-4.2-.6-5.6" fill="none" />
    <path d="M16.3 16.3c3.8.6 7.3 3.6 5.5 7-1.6 2.7-4.8 1.3-5.6-.6-.8 2-4.1 3.3-5.5.6" fill="none" />
    <path d="M16.2 16.5c1.4 3.8 2.6 7.3 5.6 11" />
  </svg>
);

export const CoinIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <ellipse cx="16" cy="16.2" rx="10.4" ry="10.8" fill="var(--gold)" />
    <path d="M13.1 11.4c1.9-1 4.6-.6 4.9 1.4.4 2.4-4.5 2.5-4.4 5 .1 2.1 3.5 2.5 5.2 1.1M16 9.2v2M16 20.4v2.2" stroke="var(--ink)" />
  </svg>
);

export const BombIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M14.5 10.5c5.2-.3 9.3 3.8 9.2 9-.1 5-4.2 8.7-9.1 8.6-5-.1-8.8-4.1-8.7-9 .2-4.7 3.8-8.4 8.6-8.6z" fill="var(--stone-3)" />
    <path d="M18.6 11.6l2.4-3.5M21 8c.8-1.5 2.6-2.4 4.4-1.8M24.6 4.5l.5-1.3M27.3 6.2l1.2-.6" />
    <path d="M10.6 15.7c.8-1.4 2-2.2 3.4-2.4" stroke="var(--bone)" strokeWidth="1.6" />
  </svg>
);

export const KeyIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M10.8 6.6c3.1-.1 5.4 2.4 5.3 5.4-.1 2.9-2.5 5.1-5.4 5-3-.1-5.2-2.5-5.1-5.4.1-2.8 2.4-5 5.2-5z" fill="var(--gold-dim)" />
    <path d="M14.8 15.6l11.4 10.6M21.4 21.8l-2.6 2.9M24.3 24.5l-2.2 2.4" />
    <circle cx="10.8" cy="11.8" r="1.6" fill="var(--ink)" stroke="none" />
  </svg>
);

export const SkullIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M16 4.8c6.2-.1 10.6 4.3 10.4 9.8-.1 3.6-2 5.8-4 7.1l-.3 4.5H9.9l-.4-4.5c-2.2-1.4-4-3.7-4-7.2 0-5.4 4.4-9.6 10.5-9.7z" fill="var(--bone-dim)" />
    <path d="M11.4 13.5c1.6-.1 2.8 1.1 2.7 2.6-.1 1.4-1.3 2.3-2.6 2.2-1.5-.1-2.4-1.2-2.4-2.5.1-1.3 1-2.2 2.3-2.3zM20.6 13.5c1.4 0 2.5 1 2.4 2.5 0 1.4-1.2 2.4-2.6 2.3-1.4-.1-2.4-1.2-2.3-2.5.1-1.4 1.1-2.3 2.5-2.3z" fill="var(--ink)" />
    <path d="M13 26.2v-3M16 26.4v-3M19 26.2v-3" />
  </svg>
);

export const StarIcon = ({ size, filled = true, ...p }: P & { filled?: boolean }) => (
  <svg {...base(size)} {...p}>
    <path
      d="M16 3.8l3.4 8 8.4.6-6.5 5.4 2.2 8.4-7.6-4.6-7.3 4.7 2-8.4-6.6-5.5 8.6-.6L16 3.8z"
      fill={filled ? 'var(--gold)' : 'none'}
      stroke={filled ? 'var(--gold-deep)' : 'currentColor'}
      opacity={filled ? 1 : 0.45}
    />
  </svg>
);

export const MapIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4.5 7.8l7.3-2.6 8.6 3 7.2-2.6.2 18.6-7.3 2.6-8.6-3-7.2 2.7-.2-18.7z" fill="var(--parch-dark)" />
    <path d="M11.8 5.3l.1 18.6M20.4 8.2l.2 18.7" />
  </svg>
);

export const BookIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 7.2c3.9-1.4 7.8-1.3 11 .9 3.3-2.2 7.2-2.3 11-.8l-.1 17.8c-3.9-1.3-7.8-1.1-10.9 1-3.2-2.1-7.1-2.3-11-.9V7.2z" fill="var(--parch-dark)" />
    <path d="M16 8.1v17.8" />
  </svg>
);

export const BagIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M11 9.6c-3.9 2.6-6.4 7.4-5.6 11.9.7 4 4.3 5.9 10.4 5.8 6.2 0 9.8-2 10.5-5.9.7-4.6-1.8-9.3-5.7-11.9" fill="var(--wood-light)" />
    <path d="M10.6 9.4c3.6.8 7.2.8 10.8 0M12.4 9.4l-1.8-4.2c3.5.9 7.2.9 10.7-.1l-1.6 4.4" />
  </svg>
);

export const ScrollIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M8.5 6.3h15.6c1.6 0 2.5 1.1 2.4 2.6v15.2c0 1.6-1.2 2.7-2.7 2.6H9.2" fill="var(--parch-dark)" />
    <path d="M8.5 6.3c-1.7 0-3 1.3-3 3s1.3 2.8 3 2.8M9.2 26.7c-1.6 0-2.8-1.2-2.8-2.8s1.4-2.8 3-2.7M12 12.4h10M12 16.4h9M12 20.4h7" />
  </svg>
);

export const ExpandIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5.4 12V5.6H12M20 5.5h6.6V12M26.5 20v6.6H20M12 26.5H5.5V20" />
  </svg>
);

export const SparkIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M16 3.5l2.2 9.6 9.6 2.9-9.6 2.6L16 28.5l-2.4-9.9L4 16l9.6-2.9L16 3.5z" fill="var(--gold)" stroke="var(--gold-deep)" />
  </svg>
);
