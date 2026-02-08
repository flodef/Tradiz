'use server';

export interface Config {
    [key: string]: any;
}

export async function getShopConfig(shopName: string): Promise<Config> {
    // Firebase removed - config now comes from SQL DB via API endpoints
    console.log('getShopConfig called for', shopName, '- Firebase removed, returning empty config');
    return {};
}

export async function updateConfigTheme(
    shopName: string,
    theme: string,
    data: any
) {
    // Firebase removed - theme config should be updated via SQL DB API
    console.log('updateConfigTheme called for', shopName, theme, '- Firebase removed, no action taken');
}
