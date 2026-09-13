export const SHOP_IDS = ['annette', 'gds'] as const;
export type ShopId = (typeof SHOP_IDS)[number];

// The demo shop accepts reviews but is not listed on the public site.
export const DEMO_SHOP_ID = 'demo';

export function isReviewableShop(shopId: string): boolean {
    return shopId === DEMO_SHOP_ID || (SHOP_IDS as readonly string[]).includes(shopId);
}
