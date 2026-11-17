import { cn } from "@/lib/utils";
export function BellMascot({
  className,
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 256 256"
      className={cn("bell-mascot", animated && "bell-mascot-awake", className)}
    >
      <g fill="#D9AF50" transform="rotate(-5 128 128)">
        <g className="bell-mascot-button">
          <rect x="107" y="42" width="46" height="15" rx="7.5" />
          <path d="M123 54H137V65H123Z" />
        </g>
        <path d="M41 166C41 108 80 65 129 65S218 108 218 166Q218 175 208 176H51Q41 176 41 166Z" />
        <rect x="29" y="184" width="199" height="18" rx="9" />
        <rect x="18" y="209" width="222" height="20" rx="10" />
        <ellipse cx="102" cy="133" rx="5" ry="7" fill="#090909" />
        <ellipse className="bell-mascot-eye" cx="158" cy="133" rx="5" ry="7" fill="#090909" />
        <path
          d="M116 150Q130 165 145 150"
          stroke="#090909"
          stroke-width="7"
          stroke-linecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
