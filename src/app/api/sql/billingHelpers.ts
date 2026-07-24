import { DbConnection } from './db';
import { DELETED_KEYWORD, UPDATING_KEYWORD, WAITING_KEYWORD, PROCESSING_KEYWORD } from '@/app/utils/constants';

const EXCLUDED_METHODS = [DELETED_KEYWORD, WAITING_KEYWORD, UPDATING_KEYWORD, PROCESSING_KEYWORD];

export interface BillingCustomerRow {
    customer_id: number;
    reference: string | null;
    first_name: string;
    last_name: string;
    meal_count: number;
}

export interface BillingAggregation {
    customers: BillingCustomerRow[];
    totalMeals: number;
}

/**
 * Aggregate meal counts per customer for a company over a date range.
 * A meal is a transaction with at least one product, not in an excluded status.
 * Refunds (negative amount) reduce the net meal count.
 */
export async function aggregateMealsByCustomer(
    connection: DbConnection,
    companyName: string,
    startAt: string,
    endAt: string
): Promise<BillingAggregation> {
    const query = connection.isPostgreSQL
        ? `
        SELECT
            c.id AS customer_id,
            c.reference,
            c.first_name,
            c.last_name,
            COALESCE(SUM(SIGN(t.amount)), 0)::int AS meal_count
        FROM dc_pos.customers c
        LEFT JOIN dc_pos.transactions t
            ON TRIM(c.first_name || ' ' || c.last_name) = TRIM(t.customer_name)
            AND t.created_at >= $2
            AND t.created_at < $3
            AND t.payment_method NOT IN (${EXCLUDED_METHODS.map((_, i) => `$${i + 4}`).join(', ')})
            AND EXISTS (
                SELECT 1 FROM dc_pos.transaction_items ti WHERE ti.transaction_id = t.id
            )
        WHERE c.company = $1
        GROUP BY c.id, c.reference, c.first_name, c.last_name
        HAVING COALESCE(SUM(SIGN(t.amount)), 0) != 0
        ORDER BY c.last_name, c.first_name
    `
        : `
        SELECT
            c.id AS customer_id,
            c.reference,
            c.first_name,
            c.last_name,
            COALESCE(SUM(SIGN(t.amount)), 0) AS meal_count
        FROM customers c
        LEFT JOIN transactions t
            ON TRIM(CONCAT(c.first_name, ' ', c.last_name)) = TRIM(t.customer_name)
            AND t.created_at >= ?
            AND t.created_at < ?
            AND t.payment_method NOT IN (${EXCLUDED_METHODS.map(() => '?').join(', ')})
            AND EXISTS (
                SELECT 1 FROM transaction_items ti WHERE ti.transaction_id = t.id
            )
        WHERE c.company = ?
        GROUP BY c.id, c.reference, c.first_name, c.last_name
        HAVING COALESCE(SUM(SIGN(t.amount)), 0) != 0
        ORDER BY c.last_name, c.first_name
    `;

    const params = connection.isPostgreSQL
        ? [companyName, startAt, endAt, ...EXCLUDED_METHODS]
        : [startAt, endAt, ...EXCLUDED_METHODS, companyName];
    const [rows] = await connection.execute(query, params);

    const customers = (rows as BillingCustomerRow[]).map((r) => ({
        customer_id: Number(r.customer_id),
        reference: r.reference ?? '',
        first_name: String(r.first_name),
        last_name: String(r.last_name),
        meal_count: Number(r.meal_count),
    }));

    return {
        customers,
        totalMeals: customers.reduce((sum, c) => sum + c.meal_count, 0),
    };
}
