import { fetchCatalog } from '../fetchCatalog';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ shopId: string }> }) {
    const { shopId } = await params;
    return fetchCatalog(shopId);
}
