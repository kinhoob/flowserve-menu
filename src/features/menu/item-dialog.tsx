import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { MenuItem } from "./menu-queries";
import { useUpsertMenuItem } from "./menu-queries";

const DIETARY = ["vegan", "vegetarian", "gluten-free", "spicy", "new"] as const;

const schema = z.object({
  name: z.string().trim().min(1, "Required").max(80),
  description: z.string().trim().max(280).optional(),
  price: z.coerce.number().min(0, "Must be ≥ 0").max(99999),
  is_available: z.boolean(),
  dietary_tags: z.array(z.string()),
  image_url: z.string().nullable().optional(),
});
type Vals = z.infer<typeof schema>;

export function ItemDialog({
  open,
  onOpenChange,
  restaurantId,
  categoryId,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  categoryId: string;
  item: MenuItem | null;
}) {
  const { user } = useAuth();
  const upsert = useUpsertMenuItem(restaurantId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<Vals>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      is_available: true,
      dietary_tags: [],
      image_url: null,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: item?.name ?? "",
        description: item?.description ?? "",
        price: item?.price ? Number(item.price) : 0,
        is_available: item?.is_available ?? true,
        dietary_tags: item?.dietary_tags ?? [],
        image_url: item?.image_url ?? null,
      });
    }
  }, [open, item, form]);

  const tags = form.watch("dietary_tags");
  const imageUrl = form.watch("image_url");

  const toggleTag = (t: string) => {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    form.setValue("dietary_tags", next, { shouldDirty: true });
  };

  const uploadImage = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large (max 5MB)");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${restaurantId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("menu-images").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    form.setValue("image_url", data.publicUrl, { shouldDirty: true });
  };

  const onSubmit = async (values: Vals) => {
    try {
      await upsert.mutateAsync({
        id: item?.id,
        category_id: categoryId,
        name: values.name,
        description: values.description || null,
        price: values.price,
        is_available: values.is_available,
        dietary_tags: values.dietary_tags,
        image_url: values.image_url ?? null,
      });
      toast.success(item ? "Item updated" : "Item created");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border bg-surface">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight">
            {item ? "Edit item" : "New item"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Image */}
          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Photo
            </span>
            {imageUrl ? (
              <div className="group relative aspect-[3/2] overflow-hidden rounded-xl border border-border">
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => form.setValue("image_url", null, { shouldDirty: true })}
                  className="absolute right-2 top-2 rounded-lg bg-background/80 p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/40 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-xs">Click to upload (max 5MB)</span>
                  </>
                )}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadImage(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </label>
              <input {...form.register("name")} className="input-field mt-1.5" autoFocus />
              {form.formState.errors.name && (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Price
              </label>
              <input
                {...form.register("price")}
                type="number"
                step="0.01"
                min="0"
                className="input-field mt-1.5"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Description
            </label>
            <textarea
              {...form.register("description")}
              rows={3}
              className="input-field mt-1.5 resize-none"
              placeholder="Short, sensory description"
            />
          </div>

          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Dietary tags
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIETARY.map((t) => {
                const active = tags.includes(t);
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggleTag(t)}
                    className={
                      "rounded-full border px-3 py-1 text-xs capitalize transition " +
                      (active
                        ? "border-[oklch(0.78_0.13_84_/_0.5)] bg-gold-soft text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground")
                    }
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Available</div>
              <div className="text-xs text-muted-foreground">Visible to guests on the menu</div>
            </div>
            <Switch
              checked={form.watch("is_available")}
              onCheckedChange={(v) => form.setValue("is_available", v, { shouldDirty: true })}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={upsert.isPending || uploading}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {item ? "Save changes" : "Create item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
