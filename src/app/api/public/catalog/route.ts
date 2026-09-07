import { getShopIdFromRequest } from '@/app/constants/shop';
import { fetchCatalog } from './fetchCatalog';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    return fetchCatalog(shopId);
}
