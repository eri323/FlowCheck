import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({
  size = 16,
  children,
  ...props
}: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </Icon>
);

export const ArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="M11 18l-6-6 6-6" />
  </Icon>
);

export const ChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const ChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const Sort = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 9l5-5 5 5" />
    <path d="M7 15l5 5 5-5" />
  </Icon>
);

export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Icon>
);

export const Close = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6L6 18" />
    <path d="M6 6l12 12" />
  </Icon>
);

export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);

export const Search = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7.5" />
    <path d="M21 21l-4.6-4.6" />
  </Icon>
);

export const Sun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8l1.8-1.8M18 6l1.8-1.8" />
  </Icon>
);

export const Moon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z" />
  </Icon>
);

export const Clock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.4 2" />
  </Icon>
);

export const CheckCircle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21.5 11.1V12a9.5 9.5 0 1 1-5.6-8.7" />
    <path d="M21.5 4.5L12 14l-2.8-2.8" />
  </Icon>
);

export const AlertCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M12 7.5v5.2" />
    <path d="M12 16.4h.01" />
  </Icon>
);

export const Grid = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="9" rx="1.4" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.4" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.4" />
    <rect x="3.5" y="15.5" width="7" height="5" rx="1.4" />
  </Icon>
);

export const Runs = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <path d="M4 6l1.1 1.1L7 5" />
    <path d="M4 12l1.1 1.1L7 11" />
    <circle cx="4.6" cy="18" r="1" />
  </Icon>
);

export const Logout = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.5" />
    <path d="M16 16.5l4.5-4.5L16 7.5" />
    <path d="M20 12H9" />
  </Icon>
);

export const Globe = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
  </Icon>
);

export const Sparkles = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5l1.7 4.3 4.3 1.7-4.3 1.7L12 15.5l-1.7-4.3L6 9.5l4.3-1.7z" />
    <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Icon>
);

export const Shield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21.5c5-2 8-5.5 8-10V5l-8-2.8L4 5v6.5c0 4.5 3 8 8 10z" />
    <path d="M9 11.8l2 2 4-4.2" />
  </Icon>
);

export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.4" />
    <circle cx="8.8" cy="9" r="1.7" />
    <path d="M21 15.5l-4.4-4.2a2 2 0 0 0-2.8 0L4.5 20.5" />
  </Icon>
);

export const ExternalLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-8.5 8.5" />
    <path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
  </Icon>
);

export const Bolt = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 2.5L4 13.5h7l-1 8 9-11h-7z" />
  </Icon>
);

export const Terminal = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.4" />
    <path d="M7.5 9.5l2.6 2.5-2.6 2.5" />
    <path d="M12.5 15h4" />
  </Icon>
);

export const Cursor = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 3.5l6.4 16 2.3-6.8 6.8-2.3z" />
  </Icon>
);

export const Eye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const Pencil = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Icon>
);

export const Filter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 5h18l-7 8.5V20l-4-2v-4.5z" />
  </Icon>
);

export const Menu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Icon>
);

export const Bell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z" />
    <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
  </Icon>
);

export const Refresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 8.5 0 0 1 14.3-6.2L21 8.5" />
    <path d="M21 4v4.5h-4.5" />
    <path d="M20.5 12a8.5 8.5 0 0 1-14.3 6.2L3 15.5" />
    <path d="M3 20v-4.5h4.5" />
  </Icon>
);
