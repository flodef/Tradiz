export interface ShopInfo {
    name: string;
    address: string;
    zipCode: string;
    city: string;
    phone: string;
    email: string;
    logo: string;
    image: string;
    googlePlaceId?: string;
}

export interface ArticleInfo {
    label: string;
    price: number;
    category: string;
    stock: number | null;
    photo: string;
    description: string;
}

export interface CurrencyInfo {
    label: string;
    symbol: string;
    maxValue: number;
    decimals: number;
    rate: number;
    fee: number;
}

export interface TimeSlot {
    open: string;
    close: string;
}

export type OpeningHours = Record<number, TimeSlot[]>;

export interface CatalogData {
    shop: ShopInfo;
    currencies: CurrencyInfo[];
    articles: ArticleInfo[];
    openingHours?: OpeningHours;
    reservationPhone?: boolean;
    reservationEmail?: boolean;
}

export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function jsDayToAdminIndex(jsDay: number): number {
    return jsDay === 0 ? 6 : jsDay - 1;
}

export function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

export function formatTimeDisplay(time: string): string {
    return time;
}

export function stockColor(stock: number): string {
    if (stock <= 3) return 'text-red-600';
    if (stock <= 7) return 'text-orange-600';
    return 'text-green-600';
}

interface ParsedSlot extends TimeSlot {
    openMin: number;
    closeMin: number;
}

/**
 * Normalize whatever came from the DB into a day → sorted-slots map, dropping
 * anything that isn't a {open: 'HH:MM', close: 'HH:MM'} entry. Malformed data
 * must never crash the public page — it simply counts as "no hours set".
 */
export function sanitizeOpeningHours(openingHours: OpeningHours | undefined): Map<number, ParsedSlot[]> {
    const byDay = new Map<number, ParsedSlot[]>();
    if (!openingHours || typeof openingHours !== 'object') return byDay;
    for (const [key, slots] of Object.entries(openingHours)) {
        const day = Number(key);
        if (!Number.isInteger(day) || !Array.isArray(slots)) continue;
        const valid = slots
            .filter(
                (s): s is TimeSlot =>
                    !!s && typeof s === 'object' && typeof s.open === 'string' && typeof s.close === 'string'
            )
            .map((s) => ({ ...s, openMin: timeToMinutes(s.open), closeMin: timeToMinutes(s.close) }))
            .filter(
                (s) =>
                    Number.isFinite(s.openMin) &&
                    Number.isFinite(s.closeMin) &&
                    s.openMin !== s.closeMin &&
                    s.openMin < 24 * 60 &&
                    s.closeMin <= 24 * 60
            )
            .sort((a, b) => a.openMin - b.openMin);
        if (valid.length > 0) byDay.set(day, valid);
    }
    return byDay;
}

export function getOpenStatus(openingHours: OpeningHours | undefined, now: Date = new Date()) {
    const adminDay = jsDayToAdminIndex(now.getDay());
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const byDay = sanitizeOpeningHours(openingHours);

    // No opening hours configured (undefined, empty object, or malformed data
    // with no valid time slots) → don't show the open/closed badge at all.
    if (byDay.size === 0)
        return {
            isOpen: false,
            status: 'unknown' as const,
            nextChange: null,
            nextDay: 0,
            nextType: null as 'open' | 'close' | null,
            minutesUntilChange: null as number | null,
        };

    // Today's slots. An overnight slot (20:00–02:00) only counts once it has
    // actually opened — the post-midnight part is covered by yesterday's check.
    for (const slot of byDay.get(adminDay) ?? []) {
        const closeAbs = slot.closeMin <= slot.openMin ? slot.closeMin + 24 * 60 : slot.closeMin;
        if (currentMinutes >= slot.openMin && currentMinutes < closeAbs) {
            return {
                isOpen: true,
                status: 'open' as const,
                nextChange: slot.close,
                nextDay: 0,
                nextType: 'close' as const,
                minutesUntilChange: closeAbs - currentMinutes,
            };
        }
    }

    // Yesterday's overnight slots spill into the early hours of today.
    for (const slot of byDay.get((adminDay + 6) % 7) ?? []) {
        if (slot.closeMin <= slot.openMin && currentMinutes < slot.closeMin) {
            return {
                isOpen: true,
                status: 'open' as const,
                nextChange: slot.close,
                nextDay: 0,
                nextType: 'close' as const,
                minutesUntilChange: slot.closeMin - currentMinutes,
            };
        }
    }

    // i goes to 7 inclusive so a single-day schedule (e.g. Fridays only) still
    // finds next week's opening once today's slots have passed.
    for (let i = 0; i <= 7; i++) {
        const checkDay = (adminDay + i) % 7;
        for (const slot of byDay.get(checkDay) ?? []) {
            if (i === 0 && slot.openMin <= currentMinutes) continue;
            // Compute minutes until this slot opens
            const minutesUntil =
                i === 0 ? slot.openMin - currentMinutes : 24 * 60 - currentMinutes + (i - 1) * 24 * 60 + slot.openMin;
            return {
                isOpen: false,
                status: 'closed' as const,
                nextChange: slot.open,
                nextDay: i,
                nextType: 'open' as const,
                minutesUntilChange: minutesUntil,
            };
        }
    }

    return {
        isOpen: false,
        status: 'closed' as const,
        nextChange: null,
        nextDay: 0,
        nextType: null as 'open' | 'close' | null,
        minutesUntilChange: null as number | null,
    };
}

/**
 * Format a duration in minutes as a human-readable French string.
 * - < 60 min: "X min"
 * - < 24h: "Xh Ymin"
 * - >= 24h: "Xj Yh"
 */
export function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) {
        return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}j ${remHours}h` : `${days}j`;
}
