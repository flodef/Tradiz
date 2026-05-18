import { NextRequest, NextResponse } from 'next/server';
import { getPosDb } from '../db';

interface UserRow {
    key: string;
    name: string;
    role: string;
}

export const dynamic = 'force-dynamic';

/**
 * POST /api/sql/resolveUser
 * Resolves a user from their public key server-side.
 * Never exposes the full user list - only returns the matched user or default.
 */
export async function POST(request: NextRequest) {
    try {
        const { publicKey } = await request.json();

        if (!publicKey || typeof publicKey !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid publicKey' },
                { status: 400 }
            );
        }

        const connection = await getPosDb();

        // Query for the specific user with matching key
        const query = `
            SELECT key, name, role
            FROM users
            WHERE key = ?
            LIMIT 1
        `;

        const [rows] = await connection.execute(query, [publicKey]);
        await connection.end();

        const userRows = rows as UserRow[];
        const foundUser = userRows.length > 0 ? userRows[0] : null;

        // Return the resolved user (or null if not found)
        // Client will handle default user creation if needed
        return NextResponse.json(
            {
                user: foundUser
                    ? {
                          name: foundUser.name,
                          role: foundUser.role,
                          key: foundUser.key,
                      }
                    : null,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error resolving user:', error);
        return NextResponse.json(
            { error: 'An error occurred while resolving user' },
            { status: 500 }
        );
    }
}
