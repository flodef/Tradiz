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

export function getOpenStatus(openingHours: OpeningHours | undefined, now: Date = new Date()) {
    const jsDay = now.getDay();
    const adminDay = jsDayToAdminIndex(jsDay);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (!openingHours)
        return {
            isOpen: false,
            status: 'unknown' as const,
            nextChange: null,
            nextDay: 0,
            nextType: null as 'open' | 'close' | null,
            minutesUntilChange: null as number | null,
        };

    // Sort today's slots by opening time to handle unsorted data
    const todaySlots = [...(openingHours[adminDay] ?? [])].sort(
        (a, b) => timeToMinutes(a.open) - timeToMinutes(b.open)
    );
    for (const slot of todaySlots) {
        const openMin = timeToMinutes(slot.open);
        let closeMin = timeToMinutes(slot.close);
        // Handle overnight slots (e.g. 20:00–02:00)
        if (closeMin <= openMin) closeMin += 24 * 60;
        const adjustedCurrent =
            currentMinutes < openMin && closeMin > 24 * 60 ? currentMinutes + 24 * 60 : currentMinutes;
        if (adjustedCurrent >= openMin && adjustedCurrent < closeMin) {
            const minutesUntilClose = closeMin - adjustedCurrent;
            return {
                isOpen: true,
                status: 'open' as const,
                nextChange: slot.close,
                nextDay: 0,
                nextType: 'close' as const,
                minutesUntilChange: minutesUntilClose,
            };
        }
    }

    for (let i = 0; i < 7; i++) {
        const checkDay = (adminDay + i) % 7;
        const slots = [...(openingHours[checkDay] ?? [])].sort((a, b) => timeToMinutes(a.open) - timeToMinutes(b.open));
        for (const slot of slots) {
            const openMin = timeToMinutes(slot.open);
            if (i === 0 && openMin <= currentMinutes) continue;
            // Compute minutes until this slot opens
            let minutesUntil: number;
            if (i === 0) {
                minutesUntil = openMin - currentMinutes;
            } else {
                // Sum remaining minutes today + full days in between + opening minutes on target day
                const endOfToday = 24 * 60;
                minutesUntil = endOfToday - currentMinutes + (i - 1) * 24 * 60 + openMin;
            }
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
