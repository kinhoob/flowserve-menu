import { cn } from "@/lib/utils";
import identity from "./identity.json";
export function FluxMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 480 360" className={cn("h-8 w-11 shrink-0", className)}>
      {identity.mark.map((d, i) => (
        <path key={i} d={d} fill={identity.gold} fillRule="evenodd" />
      ))}
    </svg>
  );
}
export function FluxLogo({ className }: { className?: string }) {
  const { word, menu } = identity;
  return (
    <span
      role="img"
      aria-label="Flux Menu"
      className={cn("inline-flex shrink-0 text-foreground", className)}
    >
      <svg aria-hidden viewBox="0 35 1400 340" className="h-9 w-[148px]">
        <g transform="translate(55 45) scale(.9)">
          {identity.mark.map((d, i) => (
            <path key={i} d={d} fill={identity.gold} fillRule="evenodd" />
          ))}
        </g>
        <g fill="currentColor" transform="translate(515 116)">
          <path transform={"translate(" + -word.x + " " + -word.y + ")"} d={word.d} />
          <path
            transform={
              "translate(" + (word.w + 24 - menu.x) + " " + (word.h - menu.y - menu.h) + ")"
            }
            d={menu.d}
          />
        </g>
      </svg>
    </span>
  );
}
