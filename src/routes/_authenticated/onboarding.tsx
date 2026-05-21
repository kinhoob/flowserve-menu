import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/auth-provider";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Set up your restaurant — Flux" }] }),
  component: OnboardingPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
  description: z.string().trim().max(280).optional(),
  currency: z.enum(["USD", "EUR", "GBP", "BRL", "MXN", "JPY", "AUD", "CAD"]),
});
type FormVals = z.infer<typeof schema>;

const CURRENCIES: FormVals["currency"][] = ["USD", "EUR", "GBP", "BRL", "MXN", "JPY", "AUD", "CAD"];

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: existing, isLoading } = useRestaurant();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "", description: "", currency: "USD" },
  });
  const name = form.watch("name");
  const slug = form.watch("slug");

  useEffect(() => {
    if (existing) navigate({ to: "/menu" });
  }, [existing, navigate]);

  useEffect(() => {
    if (!form.formState.dirtyFields.slug && name) {
      form.setValue("slug", slugify(name), { shouldValidate: true });
    }
  }, [name, form]);

  const onSubmit = async (values: FormVals) => {
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("restaurants").insert({
      owner_id: user.id,
      name: values.name,
      slug: values.slug,
      description: values.description || null,
      currency: values.currency,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "That URL is taken. Try another." : error.message);
      return;
    }
    toast.success("Restaurant created");
    await qc.invalidateQueries({ queryKey: ["restaurant"] });
    navigate({ to: "/menu" });
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-8 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary">
        <Sparkles className="h-3.5 w-3.5" /> Step 1 of 1
      </div>
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
        Let's set up your <span className="text-gradient-gold italic">venue</span>
      </h1>
      <p className="mt-3 max-w-lg text-sm text-muted-foreground">
        We'll create your tenant workspace. You can refine branding, hours and team later.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-10 space-y-5">
        <Field label="Restaurant name" error={form.formState.errors.name?.message}>
          <input
            {...form.register("name")}
            placeholder="Lumen & Co."
            className="input-field"
            autoFocus
          />
        </Field>

        <Field
          label="Public URL"
          hint={`flux.app/m/${slug || "your-venue"}`}
          error={form.formState.errors.slug?.message}
        >
          <input {...form.register("slug")} placeholder="lumen-co" className="input-field" />
        </Field>

        <Field label="Short description" hint="Shown on your public menu" error={form.formState.errors.description?.message}>
          <textarea
            {...form.register("description")}
            rows={3}
            placeholder="A modern bar serving seasonal cocktails…"
            className="input-field resize-none"
          />
        </Field>

        <Field label="Default currency" error={form.formState.errors.currency?.message}>
          <select {...form.register("currency")} className="input-field">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center justify-end pt-4">
          <Button type="submit" size="lg" disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Create restaurant
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </label>
  );
}
