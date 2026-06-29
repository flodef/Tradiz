export const inputLengthRegex = /^.{0,32}$/;
export const objectiveLengthRegex = /^.{0,150}$/;
export const messageLengthRegex = /^[\s\S]{0,500}$/;
export const descriptionLengthRegex = /^[\s\S]{0,1000}$/;
export const emailRegex = /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,64}\.[a-zA-Z]{2,22}$/;
export const frenchPhoneRegex = /^(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/;

/**
 * Normalize a first name:
 * - Everything lowercase except first letter
 * - Spaces replaced with hyphens
 * - After hyphens, next letter is uppercase
 * @param firstName First name to normalize
 * @returns Normalized first name
 */
export const normalizeFirstName = function (firstName: string): string {
    return firstName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .split('-')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('-');
};

/**
 * Normalize a family name:
 * - Everything lowercase except first letter
 * - Spaces and hyphens are kept
 * - After hyphens or spaces, next letter is uppercase
 * @param familyName Family name to normalize
 * @returns Normalized family name
 */
export const normalizeFamilyName = function (familyName: string): string {
    return familyName
        .trim()
        .toLowerCase()
        .split(/[ -]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(familyName.includes('-') ? '-' : ' ');
};

/**
 * Extract minLength and maxLength from the regex (assuming format like ^.{X,Y}$)
 */
export const getMinMaxLength = (regex: RegExp) => {
    const regexStr = regex.source; // Get the regex as a string, e.g., "^.{0,32}$"

    // Check if the regex matches the exact pattern "^.{X,Y}$" or "^.{X}$"
    const pattern = /^\^(?:\.|\[\\s\\S\])\{(\d+,?\d*)\}\$$/;
    const match = regexStr.match(pattern);

    if (match) {
        const range = match[1]; // e.g., "0,32" or "32"
        const [min, max] = range.includes(',')
            ? range.split(',').map(Number)
            : [parseInt(range, 10), parseInt(range, 10)]; // If no comma, min = max

        return { minLength: min, maxLength: max };
    }

    return { minLength: 0, maxLength: 0 }; // Return 0 for both if not a simple length regex
};

/**
 * Extract minLength from the regex (assuming format like ^.{X,Y}$)
 */
export const getMinLength = (regex: RegExp) => {
    const { minLength } = getMinMaxLength(regex);
    return minLength;
};

/**
 * Extract maxLength from the regex (assuming format like ^.{X,Y}$)
 */
export const getMaxLength = (regex: RegExp) => {
    const { maxLength } = getMinMaxLength(regex);
    return maxLength;
};
