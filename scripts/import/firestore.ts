/**
 * Fetch transaction data from Firestore using the Firebase Admin SDK.
 *
 * Requires a service account key. Set the env var:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
 *
 * Or set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY individually.
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { TransactionSet, FirestoreTransaction } from './types';

// ── Initialise Firebase Admin ────────────────────────────────────────────────

function initFirebase(): FirebaseFirestore.Firestore {
    if (!getApps().length) {
        const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (credPath) {
            initializeApp({ credential: cert(credPath) });
        } else {
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
            if (!projectId || !clientEmail || !privateKey) {
                console.error(
                    'Set GOOGLE_APPLICATION_CREDENTIALS or (FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)'
                );
                process.exit(1);
            }
            initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
        }
    }
    return getFirestore();
}

// ── Fetch all transaction sets for a shop ────────────────────────────────────

export async function fetchFromFirestore(shopName: string): Promise<TransactionSet[]> {
    const db = initFirebase();
    const prefix = `${shopName}_`;

    console.log(`Fetching Firestore collections for shop "${shopName}"...`);

    // List all top-level collections
    const collections = await db.listCollections();
    const matchingIds = collections.map((c) => c.id).filter((id) => id.startsWith(prefix));

    console.log(`  Found ${matchingIds.length} collections matching "${prefix}*"`);

    const results: TransactionSet[] = [];

    for (const colId of matchingIds.sort()) {
        const snapshot = await db.collection(colId).get();
        const transactions: FirestoreTransaction[] = [];

        for (const doc of snapshot.docs) {
            transactions.push(doc.data() as FirestoreTransaction);
        }

        if (transactions.length > 0) {
            results.push({ id: colId, transactions });
        }
    }

    return results;
}

// ── Load from a local JSON dump ──────────────────────────────────────────────

export function loadFromFile(filePath: string): TransactionSet[] {
    console.log(`Reading ${filePath}...`);
    const raw = readFileSync(resolve(filePath), 'utf-8');
    return JSON.parse(raw) as TransactionSet[];
}
