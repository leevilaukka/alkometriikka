
export function generateImageUrl(itemNumber: string, itemName: string, transform?: "products" | "medium"): string {
    const imageURL =`https://images.alko.fi/images/cs_srgb,f_auto,t_${transform || "products"}/cdn` as const;
    if(!itemName.toLowerCase) console.warn("itemName has no toLowerCase method:", itemName)
    itemName = String(itemName)
    return `${imageURL}/${itemNumber}/kuva.jpg` as const;
}