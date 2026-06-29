/**
 * Generates a product reference (EAN-13 compatible barcode)
 * 
 * This function generates a 13-digit EAN-13 barcode reference that can be used
 * for product scanning. The format follows GS1 standards used in France and Europe.
 * 
 * The reference is generated as:
 * - First 3 digits: Country code (France = 300-379, we use 300 for internal use)
 * - Next 9 digits: Sequential product ID (padded with zeros)
 * - Last digit: Checksum calculated using modulo 10 algorithm
 * 
 * @param productId - The product ID (should be sequential)
 * @returns A 13-digit EAN-13 compatible reference string
 */
export function generateProductReference(productId: number): string {
    // France GS1 prefix range: 300-379
    // We use 300 for internal product references
    const prefix = '300';
    
    // Pad product ID to 9 digits
    const productIdPadded = productId.toString().padStart(9, '0');
    
    // Calculate checksum using modulo 10 algorithm (EAN-13 standard)
    const data = prefix + productIdPadded;
    let sum = 0;
    
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(data[i]);
        // Odd positions (1, 3, 5, ...) are multiplied by 1
        // Even positions (2, 4, 6, ...) are multiplied by 3
        const weight = (i + 1) % 2 === 0 ? 3 : 1;
        sum += digit * weight;
    }
    
    const checksum = (10 - (sum % 10)) % 10;
    
    return data + checksum.toString();
}

/**
 * Validates an EAN-13 reference
 * 
 * @param reference - The reference to validate
 * @returns true if the reference is a valid EAN-13, false otherwise
 */
export function validateProductReference(reference: string): boolean {
    if (!/^\d{13}$/.test(reference)) {
        return false;
    }
    
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(reference[i]);
        const weight = (i + 1) % 2 === 0 ? 3 : 1;
        sum += digit * weight;
    }
    
    const checksum = (10 - (sum % 10)) % 10;
    return checksum === parseInt(reference[12]);
}
