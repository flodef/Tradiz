import { NextResponse } from 'next/server';
import { getMainDb } from '../db';
import { getShopIdFromRequest } from '@/app/constants/shop';

export const dynamic = 'force-dynamic';

interface ReviewRow {
    id: number;
    shop_id: string;
    user_id: string;
    user_name: string;
    rating: number;
    comment: string | null;
    created_at: string | Date;
}

export interface AdminReview {
    id: number;
    userId: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
}

function rowToReview(row: ReviewRow): AdminReview {
    return {
        id: Number(row.id),
        userId: String(row.user_id),
        userName: String(row.user_name),
        rating: Number(row.rating),
        comment: row.comment ? String(row.comment) : '',
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
}

/** GET /api/sql/getReviews — list all reviews for the current shop (admin) */
export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);

    if (!shopId) {
        return NextResponse.json({ error: 'Missing shop ID' }, { status: 400 });
    }

    let connection;
    try {
        connection = await getMainDb(shopId);
        const query = connection.isPostgreSQL
            ? `SELECT id, shop_id, user_id, user_name, rating, comment, created_at FROM dc.reviews WHERE shop_id = $1 ORDER BY created_at DESC`
            : `SELECT id, shop_id, user_id, user_name, rating, comment, created_at FROM reviews WHERE shop_id = ? ORDER BY created_at DESC`;
        const [rows] = await connection.execute(query, [shopId]);
        const reviews = (rows as ReviewRow[]).map(rowToReview);

        const avgRating =
            reviews.length > 0
                ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
                : 0;

        return NextResponse.json({ reviews, averageRating: avgRating, count: reviews.length });
    } catch (error) {
        console.error('Error fetching reviews:', error);
        return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
