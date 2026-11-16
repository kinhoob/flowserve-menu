import { motion, useReducedMotion } from "framer-motion";
import { ScanLine, RotateCcw } from "lucide-react";
import { DEMO_DISHES } from "@/features/demo/demo-data";
import { useState } from "react";

/** An illustrative scene: no camera permission, real model or portion measurement. */
export function ArPreview() {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const animate = playing && !reduced;
  return (
    <div className="mt-6">
      <div className="relative isolate overflow-hidden rounded-2xl border border-white/10 bg-[#33392e]">
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(115deg,#b5a08028,transparent_55%),repeating-linear-gradient(92deg,#ffffff06_0px,#ffffff06_1px,transparent_1px,transparent_42px)]"
        />
        <div className="relative flex items-center justify-between p-3 text-[9px] text-white/75">
          <span className="flex items-center gap-1.5">
            <ScanLine className="h-3 w-3" />
            Prévia da experiência
          </span>
          <span className="rounded-full bg-black/25 px-2 py-1">RA ilustrativa</span>
        </div>
        <div
          role="img"
          aria-label="Simulação de um prato aparecendo sobre uma mesa, com marcações de posicionamento"
          className="relative flex h-48 items-center justify-center [perspective:650px]"
        >
          <div className="absolute h-32 w-48 rounded-[50%] border border-dashed border-[#e8c784]/40 bg-[#e8c784]/5 [transform:rotateX(55deg)]" />
          <motion.div
            animate={animate ? { y: [5, -5, 5], rotate: [-4, 4, -4] } : { y: 0, rotate: 0 }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="relative h-32 w-36 overflow-hidden rounded-[50%] border-[6px] border-[#eee9da] shadow-[0_24px_25px_-8px_#0009] [transform:rotateX(18deg)]"
          >
            <img
              src={DEMO_DISHES[2].image_url}
              loading="lazy"
              alt=""
              className="h-full w-full object-cover"
            />
          </motion.div>
          <span className="absolute bottom-4 left-3 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-[9px] text-white/80">
            Mesa identificada · simulação
          </span>
        </div>
        <div className="relative flex items-center justify-between border-t border-white/10 px-3 py-3 text-[10px] text-white/80">
          <span>Da tela para a mesa.</span>
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            aria-pressed={!playing}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 px-2 py-1.5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <RotateCcw className="h-3 w-3" />
            {playing ? "Pausar" : "Reproduzir"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
        Animação ilustrativa, sem acesso à câmera. Não representa um modelo 3D nem a escala real da
        porção.
      </p>
    </div>
  );
}
