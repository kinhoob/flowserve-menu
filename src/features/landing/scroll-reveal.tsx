import { useInView, useReducedMotion } from "framer-motion";
import { useRef, type CSSProperties, type ReactNode } from "react";
export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  y = 12,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  direction?: "up" | "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const visible = useInView(ref, { amount: 0.08 });
  const style = {
    "--reveal-x": (direction === "left" ? -10 : direction === "right" ? 10 : 0) + "px",
    "--reveal-y": Math.min(y, 12) + "px",
    "--reveal-delay": (visible ? Math.min(delay, 0.12) : 0) + "s",
  } as CSSProperties;
  return (
    <div
      ref={ref}
      style={style}
      data-visible={reduced || visible}
      className={"landing-reveal " + className}
    >
      {children}
    </div>
  );
}
