import type { ImageTransform } from "$lib/types";

export function generateImageUrl(itemNumber: string, transform?: ImageTransform): string {
    const imageURL =`https://images.alko.fi/images/cs_srgb,f_auto,t_${transform || "products"}/cdn` as const;

    return `${imageURL}/${itemNumber}/kuva.jpg` as const;
}