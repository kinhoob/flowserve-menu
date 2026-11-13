import { z } from "zod";
export function isModelAssetUrl(value: string, extension: "glb" | "usdz"): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname.toLowerCase().endsWith("." + extension)
    );
  } catch {
    return false;
  }
}
export const modelAssetFields = {
  model_3d_url: z
    .string()
    .trim()
    .refine((v) => !v || isModelAssetUrl(v, "glb"), "Informe uma URL HTTPS de arquivo GLB")
    .nullable(),
  model_usdz_url: z
    .string()
    .trim()
    .refine((v) => !v || isModelAssetUrl(v, "usdz"), "Informe uma URL HTTPS de arquivo USDZ")
    .nullable(),
  portion_description: z.string().trim().max(160).nullable(),
  ar_scale_verified: z.boolean(),
};
export type DishModel = {
  name: string;
  image_url: string | null;
  model_3d_url: string | null;
  model_usdz_url: string | null;
  portion_description: string | null;
  ar_scale_verified: boolean;
};
