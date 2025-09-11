const IMAGE_BASE_URL: string = 'https://images.alko.fi/images/cs_srgb,f_auto,t_medium/cdn'

export const generateImageUrl = (itemNumber: string, itemName: string): string => {
    const sanitizedItemName = itemName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric characters with hyphens
        .replace(/^-+|-+$/g, '');    // Remove leading and trailing hyphens
    return `${IMAGE_BASE_URL}/${itemNumber}/${sanitizedItemName}.jpg`;
}