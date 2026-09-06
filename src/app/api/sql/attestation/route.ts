import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { insertAuditEvent } from '../auditHelpers';
import { buildAttestationPdf, type AttestationShopData } from '@/app/utils/attestationPdf';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const ATTESTATION_FILENAME = 'attestation_nf525.pdf';

function getAttestationPath(): string {
    const userDataPath = process.env.USERDATA_PATH || process.cwd();
    return path.join(userDataPath, ATTESTATION_FILENAME);
}

async function fetchShopData(connection: DbConnection): Promise<AttestationShopData> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const [paramRows] = await connection.execute(
        `SELECT param_key, param_value FROM ${prefix}parameters WHERE param_key IN ('name', 'serial', 'vatNumber', 'address', 'zipCode', 'city', 'naf', 'legalForm')`
    );
    const params = new Map<string, string>();
    for (const row of paramRows as { param_key: string; param_value: string }[]) {
        params.set(row.param_key, row.param_value);
    }
    return {
        name: params.get('name') || '',
        address: params.get('address') || '',
        zipCode: params.get('zipCode') || '',
        city: params.get('city') || '',
        serial: params.get('serial') || '',
        vatNumber: params.get('vatNumber') || '',
        naf: params.get('naf') || '',
        legalForm: params.get('legalForm') || '',
    };
}

/**
 * GET — returns attestation status, or the PDF file (signed or generated).
 *
 * - No query param: returns { signed: boolean, generatedAt: string|null }
 * - ?action=view: returns the signed PDF (inline) if it exists, or 404
 * - ?action=generate: generates and returns the unsigned PDF (inline)
 */
export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const attestationPath = getAttestationPath();

    if (action === 'view') {
        if (!fs.existsSync(attestationPath)) {
            return NextResponse.json({ error: 'No signed attestation found' }, { status: 404 });
        }
        const fileBuffer = fs.readFileSync(attestationPath);
        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename="attestation_nf525.pdf"',
            },
        });
    }

    if (action === 'generate') {
        let connection: DbConnection | undefined;
        try {
            connection = await getPosDb(shopId);
            const shop = await fetchShopData(connection);
            const pdfBytes = await buildAttestationPdf({ shop });
            return new NextResponse(Buffer.from(pdfBytes), {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': 'inline; filename="attestation_nf525_unsigned.pdf"',
                },
            });
        } catch (error) {
            console.error('Error generating attestation PDF:', error);
            return NextResponse.json({ error: 'Failed to generate attestation' }, { status: 500 });
        } finally {
            await connection?.end();
        }
    }

    // Default: return status
    const exists = fs.existsSync(attestationPath);
    let generatedAt: string | null = null;
    if (exists) {
        try {
            const stat = fs.statSync(attestationPath);
            generatedAt = stat.mtime.toISOString();
        } catch {
            generatedAt = null;
        }
    }
    return NextResponse.json({ signed: exists, generatedAt });
}

/**
 * POST — accepts a signed PDF upload and saves it.
 *
 * Expects multipart/form-data with a "file" field containing the PDF.
 */
export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        if (file.type !== 'application/pdf') {
            return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
        }

        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const attestationPath = getAttestationPath();
        fs.writeFileSync(attestationPath, fileBuffer);

        // Log audit event
        connection = await getPosDb(shopId);
        await insertAuditEvent(connection, {
            event_type: 'attestation_signed',
            entity_type: 'attestation',
            entity_id: 'nf525',
            user_name: 'admin',
            detail: `Signed attestation PDF uploaded (${fileBuffer.length} bytes)`,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error uploading attestation:', error);
        return NextResponse.json({ error: 'Failed to upload attestation' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}

/**
 * DELETE — removes the signed attestation PDF (for re-signing after a version change).
 */
export async function DELETE(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const attestationPath = getAttestationPath();
        if (fs.existsSync(attestationPath)) {
            fs.unlinkSync(attestationPath);
        }

        // Log audit event
        connection = await getPosDb(shopId);
        await insertAuditEvent(connection, {
            event_type: 'attestation_removed',
            entity_type: 'attestation',
            entity_id: 'nf525',
            user_name: 'admin',
            detail: 'Signed attestation PDF removed',
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing attestation:', error);
        return NextResponse.json({ error: 'Failed to remove attestation' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
