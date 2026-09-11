import { NextResponse } from 'next/server';
import { getMainDb, DbConnection } from '../../../sql/db';
import { SHOP_IDS } from '@/app/constants/shops';

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

export interface PublicReview {
    id: number;
    userId: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
}

function rowToReview(row: ReviewRow): PublicReview {
    return {
        id: Number(row.id),
        userId: String(row.user_id),
        userName: String(row.user_name),
        rating: Number(row.rating),
        comment: row.comment ? String(row.comment) : '',
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
}

/** GET /api/public/reviews/[shopId] — list all reviews for a shop */
export async function GET(_request: Request, { params }: { params: Promise<{ shopId: string }> }) {
    const { shopId: rawShopId } = await params;
    const shopId = rawShopId.toLowerCase();

    if (!SHOP_IDS.includes(shopId as (typeof SHOP_IDS)[number])) {
        return NextResponse.json({ error: 'Invalid shop' }, { status: 400 });
    }

    let connection: DbConnection | undefined;
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
        return NextResponse.json({ reviews: [], averageRating: 0, count: 0 });
    } finally {
        await connection?.end();
    }
}

/** POST /api/public/reviews/[shopId] — create a review */
export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
    const { shopId: rawShopId } = await params;
    const shopId = rawShopId.toLowerCase();

    if (!SHOP_IDS.includes(shopId as (typeof SHOP_IDS)[number])) {
        return NextResponse.json({ error: 'Invalid shop' }, { status: 400 });
    }

    let body: { userId?: string; userName?: string; rating?: number; comment?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const userId = String(body.userId ?? '').trim();
    const userName = String(body.userName ?? '').trim();
    const rating = Number(body.rating);
    const comment = String(body.comment ?? '').trim();

    if (!userId || userId.length > 64) {
        return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }
    if (userName.length < 3 || userName.length > 30) {
        return NextResponse.json({ error: 'Le nom doit contenir entre 3 et 30 caractères' }, { status: 400 });
    }
    // Accept half-star ratings (0.5 increments)
    if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || Math.round(rating * 2) !== rating * 2) {
        return NextResponse.json({ error: 'La note doit être entre 0.5 et 5 (par demi-étoiles)' }, { status: 400 });
    }
    if (comment.length < 10 || comment.length > 1000) {
        return NextResponse.json(
            { error: 'Le commentaire doit contenir entre 10 et 1000 caractères' },
            { status: 400 }
        );
    }

    let connection: DbConnection | undefined;
    try {
        connection = await getMainDb(shopId);

        // Upsert: if the user already reviewed this shop, update their review
        const upsertQuery = connection.isPostgreSQL
            ? `INSERT INTO dc.reviews (shop_id, user_id, user_name, rating, comment)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (shop_id, user_id)
               DO UPDATE SET user_name = EXCLUDED.user_name, rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = CURRENT_TIMESTAMP
               RETURNING id, shop_id, user_id, user_name, rating, comment, created_at`
            : `INSERT INTO reviews (shop_id, user_id, user_name, rating, comment)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE user_name = VALUES(user_name), rating = VALUES(rating), comment = VALUES(comment), created_at = CURRENT_TIMESTAMP`;

        const [result] = await connection.execute(upsertQuery, [shopId, userId, userName, rating, comment]);

        if (connection.isPostgreSQL) {
            const rows = result as ReviewRow[];
            if (rows.length > 0) {
                return NextResponse.json({ review: rowToReview(rows[0]) });
            }
        }

        // MariaDB doesn't return rows on upsert, so fetch the review
        const fetchQuery = connection.isPostgreSQL
            ? `SELECT id, shop_id, user_id, user_name, rating, comment, created_at FROM dc.reviews WHERE shop_id = $1 AND user_id = $2`
            : `SELECT id, shop_id, user_id, user_name, rating, comment, created_at FROM reviews WHERE shop_id = ? AND user_id = ?`;
        const [fetchRows] = await connection.execute(fetchQuery, [shopId, userId]);
        const rows = fetchRows as ReviewRow[];
        if (rows.length > 0) {
            return NextResponse.json({ review: rowToReview(rows[0]) });
        }

        return NextResponse.json({ error: 'Failed to save review' }, { status: 500 });
    } catch (error) {
        console.error('Error saving review:', error);
        return NextResponse.json({ error: 'Failed to save review' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}

/** DELETE /api/public/reviews/[shopId] — delete a user's review */
export async function DELETE(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
    const { shopId: rawShopId } = await params;
    const shopId = rawShopId.toLowerCase();

    if (!SHOP_IDS.includes(shopId as (typeof SHOP_IDS)[number])) {
        return NextResponse.json({ error: 'Invalid shop' }, { status: 400 });
    }

    let body: { userId?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const userId = String(body.userId ?? '').trim();
    if (!userId || userId.length > 64) {
        return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    let connection: DbConnection | undefined;
    try {
        connection = await getMainDb(shopId);
        const deleteQuery = connection.isPostgreSQL
            ? `DELETE FROM dc.reviews WHERE shop_id = $1 AND user_id = $2`
            : `DELETE FROM reviews WHERE shop_id = ? AND user_id = ?`;
        await connection.execute(deleteQuery, [shopId, userId]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting review:', error);
        return NextResponse.json({ error: 'Failed to delete review' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
