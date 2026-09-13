import { NextResponse } from 'next/server';
import { getMainDb } from '../db';
import { getShopIdFromRequest } from '@/app/constants/shop';
import { assertSubscriptionActive } from '../subscriptionStore';

export const dynamic = 'force-dynamic';

/** DELETE /api/sql/deleteReview — delete a review by ID (admin) */
export async function DELETE(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const subGuard = await assertSubscriptionActive(shopId);
    if (subGuard) return subGuard;

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
        if (connection.isPostgreSQL) {
            // Use RETURNING to get the deleted row (execute discards rowCount for PG)
            const query = `DELETE FROM dc.reviews WHERE id = $1 AND shop_id = $2 RETURNING id`;
            const [rows] = await connection.execute(query, [reviewId, shopId]);
            if ((rows as unknown[]).length === 0) {
                return NextResponse.json({ error: 'Review not found' }, { status: 404 });
            }
        } else {
            const query = `DELETE FROM reviews WHERE id = ? AND shop_id = ?`;
            const [result] = await connection.execute(query, [reviewId, shopId]);
            const affectedRows = (result as { affectedRows?: number })?.affectedRows ?? 0;
            if (affectedRows === 0) {
                return NextResponse.json({ error: 'Review not found' }, { status: 404 });
            }
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting review:', error);
        return NextResponse.json({ error: 'Failed to delete review' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
