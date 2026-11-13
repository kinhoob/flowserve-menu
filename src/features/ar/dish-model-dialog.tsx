import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ModelViewerElement } from "@google/model-viewer";
import { createElement, useEffect, useRef, useState } from "react";
import type { DishModel } from "./model-assets";

export default function DishModelDialog({
  item,
  onClose,
}: {
  item: DishModel;
  onClose: () => void;
}) {
  const viewer = useRef<ModelViewerElement>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [arFailed, setArFailed] = useState(false);
  const [canAr, setCanAr] = useState(false);
  useEffect(() => {
    let active = true;
    import("@google/model-viewer")
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const element = viewer.current;
    if (!ready || !element) return;
    const load = () => {
      setLoaded(true);
      setCanAr(window.isSecureContext && element.canActivateAR);
    };
    const error = () => setFailed(true);
    const arStatus = (event: Event) => {
      if ((event as CustomEvent<{ status: string }>).detail.status === "failed") setArFailed(true);
    };
    element.addEventListener("load", load);
    element.addEventListener("error", error);
    element.addEventListener("ar-status", arStatus);
    if (element.loaded) load();
    return () => {
      element.removeEventListener("load", load);
      element.removeEventListener("error", error);
      element.removeEventListener("ar-status", arStatus);
    };
  }, [ready]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto border-border bg-surface">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
        </DialogHeader>
        {item.portion_description && (
          <p className="text-sm font-medium">{item.portion_description}</p>
        )}
        {failed ? (
          <div role="status" className="space-y-3">
            <p>Não foi possível carregar a visualização 3D. Você pode continuar pelo cardápio.</p>
            {item.image_url && (
              <img
                src={item.image_url}
                alt={item.name}
                className="max-h-64 w-full rounded-xl object-contain"
              />
            )}
          </div>
        ) : (
          <>
            {!loaded && (
              <p role="status" className="text-xs text-muted-foreground">
                Carregando prato em 3D…
              </p>
            )}
            {ready &&
              createElement(
                "model-viewer",
                {
                  ref: viewer,
                  src: item.model_3d_url,
                  "ios-src": item.model_usdz_url ?? undefined,
                  poster: item.image_url ?? undefined,
                  alt: `Visualização 3D de ${item.name}`,
                  "camera-controls": "",
                  "touch-action": "pan-y",
                  ar: item.ar_scale_verified,
                  "ar-modes": "webxr scene-viewer quick-look",
                  "ar-scale": "fixed",
                  "ar-placement": "floor",
                  "shadow-intensity": "1",
                  style: {
                    width: "100%",
                    height: "min(55vh, 420px)",
                    borderRadius: "1rem",
                    background: "#171717",
                  },
                },
                <button
                  slot="ar-button"
                  hidden={!canAr || !item.ar_scale_verified}
                  className="absolute bottom-4 left-4 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                >
                  Ver na minha mesa
                </button>,
              )}
            {loaded && !canAr && item.ar_scale_verified && (
              <p className="text-xs text-muted-foreground">
                A visualização na mesa não está disponível neste navegador ou aparelho. Você ainda
                pode girar o prato em 3D.
              </p>
            )}
            {arFailed && (
              <p role="status" className="text-sm">
                Não foi possível iniciar a câmera. Confira a permissão ou continue na visualização
                3D.
              </p>
            )}
            {!item.ar_scale_verified && (
              <p className="text-xs text-muted-foreground">
                Modelo disponível em 3D. A visualização na mesa será liberada após a conferência das
                medidas.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Aparência e porção ilustrativas. A posição e o tamanho exibidos podem variar conforme
              a câmera e o ambiente. Para a RA, aponte para uma mesa bem iluminada e siga as
              instruções do celular.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
