import { supabase } from "@/integrations/supabase/client";
import type { Restaurant } from "@/features/restaurant/use-restaurant";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { getErrorDetails } from "@/lib/errors";
import { AppearanceStudio } from "./appearance-studio";
import {
  DEFAULT_COLORS,
  brandColumns,
  colorsSchema,
  isCoverUrl,
  readAppearance,
  readColors,
} from "./appearance";

export function AppearanceEditor({ restaurant }: { restaurant: Restaurant }) {
  const qc = useQueryClient();
  const [uploadingCover, setUploadingCover] = useState(false);
  async function uploadCover(file: File) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error("Envie JPG, PNG ou WEBP de até 5 MB");
      return;
    }
    setUploadingCover(true);
    try {
      const extension =
        file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${restaurant.owner_id}/${restaurant.id}/cover-${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from("menu-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
      setDraft((d) => ({ ...d, appearance: { ...d.appearance, coverUrl: data.publicUrl } }));
      toast.success("Capa enviada. Publique para exibir no cardápio.");
    } catch (error) {
      toast.error(getErrorDetails(error).message ?? "Não foi possível enviar a capa");
    } finally {
      setUploadingCover(false);
    }
  }
  const incoming = useMemo(
    () => ({
      colors: readColors({
        background: restaurant.brand_color,
        text: restaurant.brand_text_color,
        accent: restaurant.brand_accent_color,
        card: restaurant.brand_card_color,
        header: restaurant.brand_header_color,
        button: restaurant.brand_button_color,
      }),
      appearance: readAppearance(restaurant.menu_appearance),
    }),
    [restaurant],
  );
  const [draft, setDraft] = useState(incoming);
  const ready = Object.hasOwn(restaurant, "menu_appearance");
  const dirty = JSON.stringify(draft) !== JSON.stringify(incoming);
  const valid =
    colorsSchema.safeParse(draft.colors).success &&
    !!draft.appearance.buttonLabel.trim() &&
    isCoverUrl(draft.appearance.coverUrl);
  const { data: dishes } = useQuery({
    queryKey: ["appearance-preview", restaurant.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("name,description,price,image_url,portion_description")
        .eq("restaurant_id", restaurant.id)
        .eq("is_available", true)
        .order("position")
        .limit(3);
      if (error) throw error;
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!ready)
        throw new Error(
          "Aplique a atualização de personalização no Supabase e atualize esta página.",
        );
      const payload = {
        ...brandColumns(draft.colors),
        menu_appearance: readAppearance(draft.appearance),
      };
      const { data, error } = await supabase
        .from("restaurants")
        .update(payload)
        .eq("id", restaurant.id)
        .select("id")
        .single();
      if (error) {
        if (error.code === "23514")
          throw new Error(
            "Aplique a atualização de personalização completa no Supabase antes de publicar.",
          );
        throw error;
      }
      if (!data) throw new Error("Não foi possível publicar este cardápio.");
      return { colors: colorsSchema.parse(draft.colors), appearance: payload.menu_appearance };
    },
    onSuccess: async (published) => {
      setDraft(published);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["restaurant"] }),
        qc.invalidateQueries({ queryKey: ["public-menu"] }),
        qc.invalidateQueries({ queryKey: ["menu-appearance"] }),
      ]);
      toast.success("Personalização publicada no seu cardápio");
    },
    onError: (error) => toast.error(getErrorDetails(error).message ?? "Não foi possível publicar"),
  });
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-primary">Estúdio do cardápio</p>
        <h2 className="mt-2 font-display text-2xl">O cardápio com a sua assinatura.</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Escolha cada detalhe e acompanhe o resultado. O cliente só verá as mudanças depois de
          publicar. Logo, nome e banner ficam na aba Estabelecimento. Salve antes de sair desta aba
          para manter suas alterações.
        </p>
      </div>
      {!ready && (
        <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
          A prévia está disponível. Para publicar, aplique a atualização de personalização no
          Supabase e atualize esta página.
        </p>
      )}
      <fieldset disabled={save.isPending || uploadingCover} className="min-w-0">
        <AppearanceStudio
          onUploadCover={uploadCover}
          uploadingCover={uploadingCover}
          colors={draft.colors}
          appearance={draft.appearance}
          onColors={(colors) =>
            setDraft((d) => ({
              ...d,
              colors: typeof colors === "function" ? colors(d.colors) : colors,
            }))
          }
          onAppearance={(appearance) =>
            setDraft((d) => ({
              ...d,
              appearance: typeof appearance === "function" ? appearance(d.appearance) : appearance,
            }))
          }
          name={restaurant.name}
          description={restaurant.description}
          logo={restaurant.logo_url}
          currency={restaurant.currency}
          dishes={dishes}
        />
      </fieldset>
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xl">
        <div>
          <p className="text-sm font-medium" aria-live="polite">
            {save.isPending
              ? "Publicando…"
              : dirty
                ? "Você tem alterações para publicar"
                : "Seu cardápio está atualizado"}
          </p>
          <button
            disabled={save.isPending}
            onClick={() =>
              setDraft({ colors: { ...DEFAULT_COLORS }, appearance: readAppearance({}) })
            }
            className="mt-1 text-xs text-muted-foreground underline underline-offset-4"
          >
            Restaurar padrão na prévia
          </button>
        </div>
        <div className="flex gap-2">
          <button
            disabled={!dirty || save.isPending}
            onClick={() => setDraft(incoming)}
            className="rounded-xl border border-border px-3 py-2.5 text-xs disabled:opacity-40"
          >
            Descartar
          </button>
          <button
            disabled={!ready || !dirty || !valid || save.isPending || uploadingCover}
            onClick={() => save.mutate()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Publicar personalização
          </button>
        </div>
      </div>
    </div>
  );
}
