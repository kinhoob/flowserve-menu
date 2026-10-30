import { isOpenOrder, normalizeTableLabel } from "@/lib/operations";
import { publicMenuUrl, canExportQr } from "@/lib/public-menu-url";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { toast } from "sonner";
import {
  Download,
  ExternalLink,
  Loader2,
  Plus,
  QrCode as QrIcon,
  Trash2,
  Lock,
} from "lucide-react";
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
import { useTrialStatus } from "@/features/billing/trial-guard";
import { getTableLimit } from "@/features/staff/staff-picker";

export const Route = createFileRoute("/_authenticated/qrcodes")({
  head: () => ({ meta: [{ title: "QR Codes — Flux Menu" }] }),
  component: QRCodesPage,
});

const publicUrl = publicMenuUrl;

function QRCodesPage() {
  const navigate = useNavigate();
  const { data: restaurant, isLoading: rLoading } = useRestaurant();
  const { data: tables = [], isLoading: tLoading } = useTables(restaurant?.id);
  const { data: orders = [] } = useOrders(restaurant?.id);
  const { data: trial } = useTrialStatus();
  const tableLimit = getTableLimit(trial?.plan_type);
  const reachedLimit = tables.length >= tableLimit;
  const createOne = useCreateTable(restaurant?.id);
  const createMany = useCreateManyTables(restaurant?.id);
  const del = useDeleteTable(restaurant?.id);

  const occupiedLabels = new Set(
    orders
      .filter(isOpenOrder)
      .map((o) => normalizeTableLabel(o.table_label))
      .filter((label) => tables.some((t) => normalizeTableLabel(t.label) === label)),
  );

  const [label, setLabel] = useState("");
  const [bulk, setBulk] = useState({ from: 1, to: 10, prefix: "Mesa" });
  const [downloading, setDownloading] = useState(false);

  // Restaurant is auto-created on signup; no redirect needed.

  if (rLoading || !restaurant) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const downloadPng = async (t: VenueTable) => {
    if (!canExportQr()) {
      toast.error(
        "Configure VITE_PUBLIC_APP_URL com o domínio publicado antes de exportar QR Codes.",
      );
      return;
    }
    const url = publicUrl(restaurant.slug, t.label);
    const dataUrl = await QRCode.toDataURL(url, {
      width: 1024,
      margin: 2,
      color: { dark: "#111111", light: "#ffffff" },
    });
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
    if (!canExportQr()) {
      toast.error("Configure o domínio publicado antes de exportar QR Codes.");
      return;
    }
    setDownloading(true);
    try {
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const cols = 2,
        rows = 2,
        perPage = cols * rows;
      const cardW = pageW / cols,
        cardH = pageH / rows;
      for (let i = 0; i < tables.length; i++) {
        if (i > 0 && i % perPage === 0) pdf.addPage();
        const idx = i % perPage;
        const col = idx % cols,
          row = Math.floor(idx / cols);
        const x = col * cardW,
          y = row * cardH;
        const t = tables[i];
        const url = publicUrl(restaurant.slug, t.label);
        const dataUrl = await QRCode.toDataURL(url, {
          width: 600,
          margin: 1,
          color: { dark: "#111111", light: "#ffffff" },
        });
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
        pdf.text("Escaneie para ver o cardápio e pedir", x + cardW / 2, y + cardH - 42, {
          align: "center",
        });
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
            Gere QR codes por mesa apontando para o seu cardápio público em{" "}
            <span className="text-foreground">/m/{restaurant.slug}</span>.
          </p>
          {tables.length > 0 && (
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[oklch(0.72_0.2_25)] animate-pulse" />
                {occupiedLabels.size} ocupada{occupiedLabels.size === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[oklch(0.72_0.18_150)]" />
                {tables.length - occupiedLabels.size} livre
                {tables.length - occupiedLabels.size === 1 ? "" : "s"}
              </span>
            </div>
          )}
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3 text-primary" />
            Plano{" "}
            <strong className="mx-1 font-semibold text-foreground">
              {(trial?.plan_type ?? "trial").toString().toUpperCase()}
            </strong>
            · {tables.length}/{Number.isFinite(tableLimit) ? tableLimit : "∞"} QR Codes
          </div>
        </div>
        <Button
          onClick={downloadAllPdf}
          disabled={downloading || tables.length === 0}
          size="lg"
          className="gap-2"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Baixar PDF de todas
        </Button>
      </div>

      {!canExportQr() && (
        <p role="status" className="rounded-xl border border-border p-4 text-sm">
          Prévia de desenvolvimento: configure o domínio publicado para exportar QR Codes que os
          clientes possam abrir sem login.
        </p>
      )}
      {reachedLimit && (
        <div className="rounded-2xl border border-[oklch(0.78_0.13_84_/_0.4)] bg-gold-soft px-5 py-3 text-sm text-foreground">
          Você atingiu o limite de <strong>{tableLimit}</strong> QR Codes do seu plano atual.{" "}
          <a
            href="/settings?tab=billing"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Faça upgrade
          </a>{" "}
          para liberar mais mesas.
        </div>
      )}

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
                occupied={occupiedLabels.has(normalizeTableLabel(t.label))}
                onDelete={async () => {
                  try {
                    await del.mutateAsync(t.id);
                    toast.success("Mesa removida");
                  } catch (e: any) {
                    toast.error(e.message);
                  }
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
                disabled={reachedLimit}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && label.trim()) {
                    if (reachedLimit)
                      return toast.error(`Limite de ${tableLimit} QR Codes atingido`);
                    try {
                      await createOne.mutateAsync({ label: label.trim() });
                      setLabel("");
                      toast.success("Mesa criada");
                    } catch (err: any) {
                      toast.error(err.message);
                    }
                  }
                }}
              />
              <Button
                onClick={async () => {
                  if (!label.trim()) return;
                  if (reachedLimit) return toast.error(`Limite de ${tableLimit} QR Codes atingido`);
                  try {
                    await createOne.mutateAsync({ label: label.trim() });
                    setLabel("");
                    toast.success("Mesa criada");
                  } catch (err: any) {
                    toast.error(err.message);
                  }
                }}
                disabled={createOne.isPending || reachedLimit}
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4" /> Adicionar mesa
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="font-display text-lg tracking-tight">Em lote</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Crie um intervalo de mesas de uma vez.
            </p>
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
                  const count = bulk.to - bulk.from + 1;
                  if (tables.length + count > tableLimit) {
                    return toast.error(
                      `Limite do plano: ${tableLimit} QR Codes. Restam ${Math.max(0, tableLimit - tables.length)}.`,
                    );
                  }
                  try {
                    await createMany.mutateAsync(bulk);
                    toast.success(`${count} mesas criadas`);
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}
                disabled={createMany.isPending || reachedLimit}
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
  occupied,
  onDelete,
  onDownload,
}: {
  table: VenueTable;
  slug: string;
  occupied: boolean;
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
    <li
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border bg-surface p-4 hover-lift transition-colors",
        occupied
          ? "border-[oklch(0.62_0.21_25_/_0.55)] hover:border-[oklch(0.62_0.21_25_/_0.85)]"
          : "border-border hover:border-[oklch(0.78_0.13_84_/_0.3)]",
      )}
    >
      <span
        className={cn(
          "absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
          occupied
            ? "bg-[oklch(0.62_0.21_25_/_0.15)] text-[oklch(0.78_0.18_25)]"
            : "bg-[oklch(0.62_0.18_150_/_0.12)] text-[oklch(0.78_0.18_150)]",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            occupied ? "bg-[oklch(0.72_0.2_25)] animate-pulse" : "bg-[oklch(0.72_0.18_150)]",
          )}
        />
        {occupied ? "Ocupada" : "Livre"}
      </span>
      <div className="flex items-start justify-between gap-2 pr-20">
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
