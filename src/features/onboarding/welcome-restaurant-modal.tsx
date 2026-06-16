import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/auth-provider";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function WelcomeRestaurantModal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!user) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Informe o nome do seu estabelecimento");
      return;
    }
    setSaving(true);
    let baseSlug = slugify(trimmed) || "meu-restaurante";
    let slug = baseSlug;
    let attempt = 0;
    // try a few suffixes if slug collides
    while (attempt < 5) {
      const { error } = await supabase.from("restaurants").insert({
        owner_id: user.id,
        name: trimmed,
        slug,
        currency: "BRL",
      });
      if (!error) {
        toast.success("Tudo pronto! Bem-vindo ao Flux 🚀");
        await qc.invalidateQueries({ queryKey: ["restaurant"] });
        setSaving(false);
        return;
      }
      if (error.message.includes("duplicate")) {
        attempt += 1;
        slug = `${baseSlug}-${Math.floor(Math.random() * 9000) + 1000}`;
        continue;
      }
      toast.error(error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    toast.error("Não foi possível gerar uma URL única. Tente outro nome.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-3xl border border-border bg-surface p-7 shadow-2xl"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
          <Rocket className="h-5 w-5 text-primary" />
        </div>
        <h2 className="mt-5 font-display text-2xl tracking-tight">
          Bem-vindo ao <span className="text-gradient-gold italic">Flux</span> 🚀
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Para começar, qual o nome do seu estabelecimento?
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          placeholder="Ex: Cantina da Nona"
          className="mt-5 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-[oklch(0.78_0.13_84_/_0.5)]"
        />
        <button
          onClick={handleSave}
          disabled={saving || name.trim().length < 2}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar e começar"}
        </button>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Você poderá ajustar marca, moeda e equipe depois em Configurações.
        </p>
      </motion.div>
    </div>
  );
}
