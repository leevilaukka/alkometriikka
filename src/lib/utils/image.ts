
export const generateImageUrl = (itemNumber: string, itemName: string, transform?: "products" | "medium"): string => {
    const imageURL =`https://images.alko.fi/images/cs_srgb,f_auto,t_${transform || "products"}/cdn`
    if(!itemName.toLowerCase) console.warn("itemName has no toLowerCase method:", itemName)
    itemName = String(itemName)
    const sanitizedItemName = itemName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric characters with hyphens
        .replace(/^-+|-+$/g, '');    // Remove leading and trailing hyphens
    return `${imageURL}/${itemNumber}/${sanitizedItemName}.jpg`;
}