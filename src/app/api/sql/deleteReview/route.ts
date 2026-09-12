import { NextResponse } from 'next/server';
import { getMainDb } from '../db';
import { getShopIdFromRequest } from '@/app/constants/shop';

export const dynamic = 'force-dynamic';

/** DELETE /api/sql/deleteReview — delete a review by ID (admin) */
export async function DELETE(request: Request) {
    const shopId = getShopIdFromRequest(request);

    if (!shopId) {
        return NextResponse.json({ error: 'Missing shop ID' }, { status: 400 });
    }

    let body: { id?: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const reviewId = Number(body.id);
    if (!Number.isFinite(reviewId) || reviewId <= 0) {
        return NextResponse.json({ error: 'Invalid review ID' }, { status: 400 });
    }

    let connection;
    try {
        connection = await getMainDb(shopId);
        const query = connection.isPostgreSQL
            ? `DELETE FROM dc.reviews WHERE id = $1 AND shop_id = $2`
            : `DELETE FROM reviews WHERE id = ? AND shop_id = ?`;
        const [result] = await connection.execute(query, [reviewId, shopId]);
        const affectedRows = connection.isPostgreSQL
            ? ((result as { rowCount?: number })?.rowCount ?? 0)
            : ((result as { affectedRows?: number })?.affectedRows ?? 0);
        if (affectedRows === 0) {
            return NextResponse.json({ error: 'Review not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting review:', error);
        return NextResponse.json({ error: 'Failed to delete review' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
