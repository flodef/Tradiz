export const SHOP_IDS = ['annette', 'gds'] as const;
export type ShopId = (typeof SHOP_IDS)[number];
