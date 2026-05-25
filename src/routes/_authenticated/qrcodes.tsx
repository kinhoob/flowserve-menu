import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { Download, ExternalLink, Loader2, Plus, QrCode as QrIcon, Trash2 } from "lucide-react";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useOrders } from "@/features/orders/order-queries";
import {
  useCreateManyTables,
  useCreateTable,
  useDeleteTable,
  useTables,
  type VenueTable,
} from "@/features/tables/table-queries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/qrcodes")({
  head: () => ({ meta: [{ title: "QR Codes — Flux" }] }),
  component: QRCodesPage,
});

function publicUrl(slug: string, table: string) {
  if (typeof window === "undefined") return `/m/${slug}?table=${encodeURIComponent(table)}`;
  return `${window.location.origin}/m/${slug}?table=${encodeURIComponent(table)}`;
}

function QRCodesPage() {
  const navigate = useNavigate();
  const { data: restaurant, isLoading: rLoading } = useRestaurant();
  const { data: tables = [], isLoading: tLoading } = useTables(restaurant?.id);
  const { data: orders = [] } = useOrders(restaurant?.id);
  const createOne = useCreateTable(restaurant?.id);
  const createMany = useCreateManyTables(restaurant?.id);
  const del = useDeleteTable(restaurant?.id);

  const occupiedLabels = new Set(
    orders
      .filter((o) => o.status !== "served" && o.status !== "cancelled" && o.table_label)
      .map((o) => o.table_label as string),
  );

  const [label, setLabel] = useState("");
  const [bulk, setBulk] = useState({ from: 1, to: 10, prefix: "Mesa" });
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!rLoading && !restaurant) navigate({ to: "/onboarding" });
  }, [rLoading, restaurant, navigate]);

  if (rLoading || !restaurant) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const downloadPng = async (t: VenueTable) => {
    const url = publicUrl(restaurant.slug, t.label);
    const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2, color: { dark: "#111111", light: "#ffffff" } });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `flux-${restaurant.slug}-${t.label.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
  };

  const downloadAllPdf = async () => {
    if (tables.length === 0) {
      toast.error("Cadastre ao menos uma mesa");
      return;
    }
    setDownloading(true);
    try {
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const cols = 2, rows = 2, perPage = cols * rows;
      const cardW = pageW / cols, cardH = pageH / rows;
      for (let i = 0; i < tables.length; i++) {
        if (i > 0 && i % perPage === 0) pdf.addPage();
        const idx = i % perPage;
        const col = idx % cols, row = Math.floor(idx / cols);
        const x = col * cardW, y = row * cardH;
        const t = tables[i];
        const url = publicUrl(restaurant.slug, t.label);
        const dataUrl = await QRCode.toDataURL(url, { width: 600, margin: 1, color: { dark: "#111111", light: "#ffffff" } });
        const qrSize = Math.min(cardW, cardH) - 120;
        pdf.setDrawColor(220);
        pdf.roundedRect(x + 24, y + 24, cardW - 48, cardH - 48, 12, 12);
        pdf.setFontSize(11);
        pdf.setTextColor(120);
        pdf.text(restaurant.name.toUpperCase(), x + cardW / 2, y + 56, { align: "center" });
        pdf.addImage(dataUrl, "PNG", x + (cardW - qrSize) / 2, y + 72, qrSize, qrSize);
        pdf.setFontSize(22);
        pdf.setTextColor(20);
        pdf.text(t.label, x + cardW / 2, y + cardH - 60, { align: "center" });
        pdf.setFontSize(9);
        pdf.setTextColor(140);
        pdf.text("Escaneie para ver o cardápio e pedir", x + cardW / 2, y + cardH - 42, { align: "center" });
      }
      pdf.save(`flux-${restaurant.slug}-qrcodes.pdf`);
      toast.success("PDF gerado");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary">QR Codes</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">
            Mesas & <span className="text-gradient-gold italic">QR</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gere QR codes por mesa apontando para o seu cardápio público em <span className="text-foreground">/m/{restaurant.slug}</span>.
          </p>
        </div>
        <Button onClick={downloadAllPdf} disabled={downloading || tables.length === 0} size="lg" className="gap-2">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Baixar PDF de todas
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {tLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/40 py-16 text-center animate-fade-up">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
              <QrIcon className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-sm font-medium">Nenhuma mesa cadastrada</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Adicione mesas no painel ao lado para gerar QR codes.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 stagger sm:grid-cols-2 xl:grid-cols-3">
            {tables.map((t) => (
              <TableCard
                key={t.id}
                table={t}
                slug={restaurant.slug}
                occupied={occupiedLabels.has(t.label)}
                onDelete={async () => {
                  try { await del.mutateAsync(t.id); toast.success("Mesa removida"); }
                  catch (e: any) { toast.error(e.message); }
                }}
                onDownload={() => downloadPng(t)}
              />
            ))}
          </ul>
        )}

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="font-display text-lg tracking-tight">Nova mesa</h3>
            <p className="mt-1 text-xs text-muted-foreground">Adicione uma mesa avulsa.</p>
            <div className="mt-4 space-y-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex.: Mesa 14"
                className="input-field"
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && label.trim()) {
                    try { await createOne.mutateAsync({ label: label.trim() }); setLabel(""); toast.success("Mesa criada"); }
                    catch (err: any) { toast.error(err.message); }
                  }
                }}
              />
              <Button
                onClick={async () => {
                  if (!label.trim()) return;
                  try { await createOne.mutateAsync({ label: label.trim() }); setLabel(""); toast.success("Mesa criada"); }
                  catch (err: any) { toast.error(err.message); }
                }}
                disabled={createOne.isPending}
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4" /> Adicionar mesa
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="font-display text-lg tracking-tight">Em lote</h3>
            <p className="mt-1 text-xs text-muted-foreground">Crie um intervalo de mesas de uma vez.</p>
            <div className="mt-4 space-y-3">
              <input
                value={bulk.prefix}
                onChange={(e) => setBulk((b) => ({ ...b, prefix: e.target.value }))}
                placeholder="Prefixo (Mesa)"
                className="input-field"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  value={bulk.from}
                  onChange={(e) => setBulk((b) => ({ ...b, from: Number(e.target.value) }))}
                  className="input-field"
                />
                <input
                  type="number"
                  min={1}
                  value={bulk.to}
                  onChange={(e) => setBulk((b) => ({ ...b, to: Number(e.target.value) }))}
                  className="input-field"
                />
              </div>
              <Button
                onClick={async () => {
                  if (bulk.to < bulk.from) return toast.error("Intervalo inválido");
                  if (bulk.to - bulk.from > 99) return toast.error("Máximo de 100 por vez");
                  try {
                    await createMany.mutateAsync(bulk);
                    toast.success(`${bulk.to - bulk.from + 1} mesas criadas`);
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}
                disabled={createMany.isPending}
                variant="secondary"
                className="w-full gap-2"
              >
                {createMany.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Gerar intervalo
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TableCard({
  table,
  slug,
  onDelete,
  onDownload,
}: {
  table: VenueTable;
  slug: string;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const url = publicUrl(slug, table.label);

  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, url, {
      width: 220,
      margin: 1,
      color: { dark: "#0f0f0f", light: "#ffffff" },
    }).catch(() => {});
  }, [url]);

  return (
    <li className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 hover-lift hover:border-[oklch(0.78_0.13_84_/_0.3)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-xl tracking-tight">{table.label}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Código {table.short_code}
          </div>
        </div>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-background hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-center rounded-xl bg-white p-3">
        <canvas ref={ref} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1 gap-1.5" onClick={onDownload}>
          <Download className="h-3.5 w-3.5" /> PNG
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-surface-2"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir
        </a>
      </div>
    </li>
  );
}
