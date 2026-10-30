import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getErrorDetails } from "@/lib/errors";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Loader2, Save, Store, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function EstablishmentSection({
  restaurantId,
  initialName,
  slug,
  currency,
  timezone,
  initialLogoUrl,
  initialBrandColor,
  initialBrandTextColor,
  initialBrandAccentColor,
  initialBrandCardColor,
  initialBrandHeaderColor,
  initialBrandButtonColor,
  initialBanner,
}: {
  restaurantId: string;
  initialName: string;
  slug: string;
  currency: string;
  timezone: string;
  initialLogoUrl: string | null;
  initialBrandColor: string | null;
  initialBrandTextColor: string | null;
  initialBrandAccentColor: string | null;
  initialBrandCardColor: string | null;
  initialBrandHeaderColor: string | null;
  initialBrandButtonColor: string | null;
  initialBanner: {
    enabled: boolean;
    title: string;
    description: string;
    image_url: string | null;
    cta_label: string;
  };
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState(initialName);
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);
  useEffect(() => setSelectedTimezone(timezone), [timezone]);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const DEFAULT_BG = "#0b0b0c";
  const DEFAULT_TEXT = "#f5f5f4";
  const DEFAULT_ACCENT = "#d4a017";
  const DEFAULT_CARD = "#171716";
  const DEFAULT_HEADER = "#0b0b0c";
  const DEFAULT_BUTTON = "#d4a017";
  const [brandColor, setBrandColor] = useState<string>(initialBrandColor || DEFAULT_BG);
  const [brandTextColor, setBrandTextColor] = useState<string>(
    initialBrandTextColor || DEFAULT_TEXT,
  );
  const [brandAccentColor, setBrandAccentColor] = useState<string>(
    initialBrandAccentColor || DEFAULT_ACCENT,
  );
  const [brandCardColor, setBrandCardColor] = useState<string>(
    initialBrandCardColor || DEFAULT_CARD,
  );
  const [brandHeaderColor, setBrandHeaderColor] = useState<string>(
    initialBrandHeaderColor || DEFAULT_HEADER,
  );
  const [brandButtonColor, setBrandButtonColor] = useState<string>(
    initialBrandButtonColor || DEFAULT_BUTTON,
  );
  const [savingColor, setSavingColor] = useState(false);

  // Banner state
  const [bannerEnabled, setBannerEnabled] = useState(initialBanner.enabled);
  const [bannerTitle, setBannerTitle] = useState(initialBanner.title || "");
  const [bannerDescription, setBannerDescription] = useState(initialBanner.description || "");
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(initialBanner.image_url);
  const [bannerCtaLabel, setBannerCtaLabel] = useState(initialBanner.cta_label || "");
  const [bannerUploading, setBannerUploading] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);

  useEffect(() => setName(initialName), [initialName]);
  useEffect(() => setLogoUrl(initialLogoUrl), [initialLogoUrl]);
  useEffect(() => setBrandColor(initialBrandColor || DEFAULT_BG), [initialBrandColor]);
  useEffect(
    () => setBrandTextColor(initialBrandTextColor || DEFAULT_TEXT),
    [initialBrandTextColor],
  );
  useEffect(
    () => setBrandAccentColor(initialBrandAccentColor || DEFAULT_ACCENT),
    [initialBrandAccentColor],
  );
  useEffect(
    () => setBrandCardColor(initialBrandCardColor || DEFAULT_CARD),
    [initialBrandCardColor],
  );
  useEffect(
    () => setBrandHeaderColor(initialBrandHeaderColor || DEFAULT_HEADER),
    [initialBrandHeaderColor],
  );
  useEffect(
    () => setBrandButtonColor(initialBrandButtonColor || DEFAULT_BUTTON),
    [initialBrandButtonColor],
  );

  const colorsDirty =
    brandColor !== (initialBrandColor || DEFAULT_BG) ||
    brandTextColor !== (initialBrandTextColor || DEFAULT_TEXT) ||
    brandAccentColor !== (initialBrandAccentColor || DEFAULT_ACCENT) ||
    brandCardColor !== (initialBrandCardColor || DEFAULT_CARD) ||
    brandHeaderColor !== (initialBrandHeaderColor || DEFAULT_HEADER) ||
    brandButtonColor !== (initialBrandButtonColor || DEFAULT_BUTTON);

  const saveBrandColor = async (overrides?: Partial<Record<string, string>>) => {
    setSavingColor(true);
    try {
      const payload = {
        brand_color: overrides?.brand_color ?? brandColor,
        brand_text_color: overrides?.brand_text_color ?? brandTextColor,
        brand_accent_color: overrides?.brand_accent_color ?? brandAccentColor,
        brand_card_color: overrides?.brand_card_color ?? brandCardColor,
        brand_header_color: overrides?.brand_header_color ?? brandHeaderColor,
        brand_button_color: overrides?.brand_button_color ?? brandButtonColor,
      };
      const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurantId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["restaurant"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Cores da marca atualizadas");
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      toast.error(e.message ?? "Erro ao salvar cores");
    } finally {
      setSavingColor(false);
    }
  };

  const resetBrandColors = async () => {
    setBrandColor(DEFAULT_BG);
    setBrandTextColor(DEFAULT_TEXT);
    setBrandAccentColor(DEFAULT_ACCENT);
    setBrandCardColor(DEFAULT_CARD);
    setBrandHeaderColor(DEFAULT_HEADER);
    setBrandButtonColor(DEFAULT_BUTTON);
    await saveBrandColor({
      brand_color: DEFAULT_BG,
      brand_text_color: DEFAULT_TEXT,
      brand_accent_color: DEFAULT_ACCENT,
      brand_card_color: DEFAULT_CARD,
      brand_header_color: DEFAULT_HEADER,
      brand_button_color: DEFAULT_BUTTON,
    });
  };

  const uploadBannerImage = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    setBannerUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${restaurantId}/banner-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("menu-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
      setBannerImageUrl(data.publicUrl);
      toast.success("Imagem do banner enviada");
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      toast.error(e.message ?? "Erro ao enviar imagem");
    } finally {
      setBannerUploading(false);
    }
  };

  const saveBanner = async () => {
    setSavingBanner(true);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({
          banner_enabled: bannerEnabled,
          banner_title: bannerTitle || null,
          banner_description: bannerDescription || null,
          banner_image_url: bannerImageUrl,
          banner_cta_label: bannerCtaLabel || null,
        })
        .eq("id", restaurantId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["restaurant"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Banner promocional salvo");
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      toast.error(e.message ?? "Erro ao salvar banner");
    } finally {
      setSavingBanner(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${restaurantId}/logo-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("menu-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
      const url = data.publicUrl;
      const { error: dbErr } = await supabase
        .from("restaurants")
        .update({ logo_url: url })
        .eq("id", restaurantId);
      if (dbErr) throw dbErr;
      setLogoUrl(url);
      qc.invalidateQueries({ queryKey: ["restaurant"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Logo atualizado");
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      toast.error(e.message ?? "Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    const { error } = await supabase
      .from("restaurants")
      .update({ logo_url: null })
      .eq("id", restaurantId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLogoUrl(null);
    qc.invalidateQueries({ queryKey: ["restaurant"] });
    qc.invalidateQueries({ queryKey: ["public-menu"] });
    toast.success("Logo removido");
  };

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Informe um nome");
      new Intl.DateTimeFormat("pt-BR", { timeZone: selectedTimezone }).format();
      const { error } = await supabase
        .from("restaurants")
        .update({ name: trimmed, timezone: selectedTimezone })
        .eq("id", restaurantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurant"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Estabelecimento atualizado");
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const dirty = name.trim() !== initialName.trim() || selectedTimezone !== timezone;
  const initials = (initialName || "R").slice(0, 2).toUpperCase();

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
          <Store className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl tracking-tight">Estabelecimento</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Este nome e logo aparecem no Dashboard, na navegação e no cardápio público do cliente.
          </p>

          <div className="mt-5 flex flex-col items-start gap-4 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo do estabelecimento"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-display text-xl text-primary">{initials}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Foto de perfil / Logo</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Aparece no topo do cardápio público. PNG, JPG ou WEBP (máx 5MB).
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium transition hover:border-[oklch(0.78_0.13_84_/_0.5)]">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Store className="h-3.5 w-3.5" />
                  )}
                  {logoUrl ? "Trocar imagem" : "Enviar imagem"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadLogo(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Nome do estabelecimento
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                  placeholder="Ex.: Trattoria Bella"
                />
                <button
                  onClick={() => save.mutate()}
                  disabled={!dirty || save.isPending}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  {save.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar
                </button>
              </div>
            </div>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Slug</dt>
                <dd className="mt-1 truncate text-sm">/m/{slug}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Moeda
                </dt>
                <dd className="mt-1 text-sm">{currency}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Fuso</dt>
                <dd className="mt-1">
                  <select
                    aria-label="Fuso horário do restaurante"
                    value={selectedTimezone}
                    onChange={(e) => setSelectedTimezone(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                  >
                    {Array.from(
                      new Set([
                        timezone,
                        "America/Sao_Paulo",
                        "America/Manaus",
                        "America/Cuiaba",
                        "America/Rio_Branco",
                        "America/Noronha",
                        "Europe/Lisbon",
                        "UTC",
                      ]),
                    ).map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
            </dl>

            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Cores da marca</p>
                <p className="text-xs text-muted-foreground">
                  Personalize seu cardápio público com a identidade visual do seu estabelecimento.
                  Disponível em todos os planos.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: "Principal (fundo)",
                    hint: "Cor de fundo do cardápio",
                    value: brandColor,
                    set: setBrandColor,
                  },
                  {
                    label: "Secundária (texto)",
                    hint: "Cor das letras",
                    value: brandTextColor,
                    set: setBrandTextColor,
                  },
                  {
                    label: "Destaque",
                    hint: "Preços e detalhes",
                    value: brandAccentColor,
                    set: setBrandAccentColor,
                  },
                  {
                    label: "Cabeçalho",
                    hint: "Topo do cardápio",
                    value: brandHeaderColor,
                    set: setBrandHeaderColor,
                  },
                  {
                    label: "Cards",
                    hint: "Fundo dos itens",
                    value: brandCardColor,
                    set: setBrandCardColor,
                  },
                  {
                    label: "Botões",
                    hint: "Cor dos botões",
                    value: brandButtonColor,
                    set: setBrandButtonColor,
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-lg border border-border bg-background/60 p-3"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {c.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">{c.hint}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="color"
                        value={c.value}
                        onChange={(e) => c.set(e.target.value)}
                        className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-background p-1"
                        aria-label={`Selecionar ${c.label}`}
                      />
                      <input
                        type="text"
                        value={c.value}
                        onChange={(e) => c.set(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div
                  className="flex flex-1 flex-col gap-2 rounded-xl border border-border p-4"
                  style={{ backgroundColor: brandColor, color: brandTextColor }}
                >
                  <div
                    className="-mx-2 -mt-2 rounded-lg px-3 py-2 text-xs font-medium"
                    style={{ backgroundColor: brandHeaderColor, color: brandTextColor }}
                  >
                    Cabeçalho
                  </div>
                  <div
                    className="flex items-center justify-between rounded-lg p-3"
                    style={{ backgroundColor: brandCardColor, color: brandTextColor }}
                  >
                    <span className="text-sm">Prato exemplo</span>
                    <span className="text-sm font-medium" style={{ color: brandAccentColor }}>
                      R$ 49,90
                    </span>
                  </div>
                  <button
                    type="button"
                    className="self-start rounded-full px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: brandButtonColor, color: "#fff" }}
                  >
                    Botão
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => saveBrandColor()}
                    disabled={savingColor || !colorsDirty}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    {savingColor ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Salvar cores
                  </button>
                  <button
                    type="button"
                    onClick={resetBrandColors}
                    disabled={savingColor}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                  >
                    Voltar ao padrão
                  </button>
                </div>
              </div>
            </div>

            {/* Promotional banner */}
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Banner promocional</p>
                  <p className="text-xs text-muted-foreground">
                    Exiba um banner em destaque no topo do cardápio público.
                  </p>
                </div>
                <Switch checked={bannerEnabled} onCheckedChange={setBannerEnabled} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Título
                  </label>
                  <input
                    type="text"
                    value={bannerTitle}
                    onChange={(e) => setBannerTitle(e.target.value)}
                    placeholder="Happy Hour até 19h"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Rótulo do botão (opcional)
                  </label>
                  <input
                    type="text"
                    value={bannerCtaLabel}
                    onChange={(e) => setBannerCtaLabel(e.target.value)}
                    placeholder="Aproveitar"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Descrição
                  </label>
                  <textarea
                    value={bannerDescription}
                    onChange={(e) => setBannerDescription(e.target.value)}
                    placeholder="Chopp em dobro e petiscos com 20% off."
                    rows={2}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Imagem (opcional)
                  </label>
                  <div className="mt-1.5 flex items-center gap-3">
                    {bannerImageUrl ? (
                      <img
                        src={bannerImageUrl}
                        alt="Banner"
                        className="h-16 w-28 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                        Sem imagem
                      </div>
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:text-foreground">
                      {bannerUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5" />
                      )}
                      Enviar imagem
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadBannerImage(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {bannerImageUrl && (
                      <button
                        type="button"
                        onClick={() => setBannerImageUrl(null)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={saveBanner}
                  disabled={savingBanner}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingBanner ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar banner
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
