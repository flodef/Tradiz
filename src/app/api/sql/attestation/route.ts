import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { insertAuditEvent } from '../auditHelpers';
import { buildAttestationPdf, type AttestationShopData } from '@/app/utils/attestationPdf';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const ATTESTATION_FILENAME_PREFIX = 'attestation_nf525';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const PDF_MAGIC = Buffer.from('%PDF-', 'utf8');

/**
 * Sanitize a shopId for use in a filename. Only allow [a-z0-9_-]; everything
 * else is replaced with '_'. This prevents path traversal via the shopId
 * (which comes from the request host).
 */
export function sanitizeShopId(shopId: string): string {
    const sanitized = shopId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return sanitized || 'default';
}

/**
 * Resolve a writable base directory for attestation storage.
 *
 * - Electron: uses USERDATA_PATH (set by electron/main.js), falling back to cwd.
 * - Vercel: uses /tmp (the only writable directory on Vercel serverless).
 * - Other: uses process.cwd() as a last resort.
 */
function getAttestationDir(): string {
    if (process.env.USERDATA_PATH) return process.env.USERDATA_PATH;
    if (process.env.VERCEL) return '/tmp';
    return process.cwd();
}

function getAttestationPath(shopId: string): string {
    const dir = getAttestationDir();
    const safeShopId = sanitizeShopId(shopId);
    return path.join(dir, `${ATTESTATION_FILENAME_PREFIX}_${safeShopId}.pdf`);
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
    const attestationPath = getAttestationPath(shopId);

    if (action === 'view') {
        try {
            if (!fs.existsSync(attestationPath)) {
                return NextResponse.json({ error: 'No signed attestation found' }, { status: 404 });
            }
            const fileBuffer = fs.readFileSync(attestationPath);
            return new NextResponse(fileBuffer, {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `inline; filename="attestation_nf525.pdf"`,
                },
            });
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'EROFS' || code === 'EACCES') {
                return NextResponse.json(
                    { error: 'Attestation storage is not available in this environment' },
                    { status: 503 }
                );
            }
            console.error('Error reading attestation:', error);
            return NextResponse.json({ error: 'Failed to read attestation' }, { status: 500 });
        }
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
    try {
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
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EROFS' || code === 'EACCES') {
            return NextResponse.json({ signed: false, generatedAt: null });
        }
        console.error('Error checking attestation status:', error);
        return NextResponse.json({ error: 'Failed to check attestation status' }, { status: 500 });
    }
}

/**
 * POST — accepts a signed PDF upload and saves it.
 *
 * Expects multipart/form-data with:
 * - "file": the PDF file
 * - "changedBy" (optional): the name of the operator performing the upload
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

        // Size validation
        if (file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                { error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` },
                { status: 413 }
            );
        }

        const fileBuffer = Buffer.from(await file.arrayBuffer());

        // Magic-bytes validation: verify the file starts with %PDF-
        // Don't trust the client-supplied MIME type alone.
        if (fileBuffer.length < 5 || !fileBuffer.subarray(0, 5).equals(PDF_MAGIC)) {
            return NextResponse.json({ error: 'File is not a valid PDF' }, { status: 400 });
        }

        const operatorName = (formData.get('changedBy') as string) || 'admin';
        const attestationPath = getAttestationPath(shopId);

        try {
            fs.writeFileSync(attestationPath, fileBuffer);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'EROFS' || code === 'EACCES') {
                return NextResponse.json(
                    { error: 'Attestation storage is not writable in this environment' },
                    { status: 503 }
                );
            }
            throw error;
        }

        // Log audit event with the actual operator name
        connection = await getPosDb(shopId);
        await insertAuditEvent(connection, {
            event_type: 'attestation_signed',
            entity_type: 'attestation',
            entity_id: 'nf525',
            user_name: operatorName,
            detail: `Signed attestation PDF uploaded (${fileBuffer.length} bytes) for shop ${shopId || 'default'}`,
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
 *
 * Accepts an optional `changedBy` query parameter for the operator name.
 */
export async function DELETE(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    try {
        const url = new URL(request.url);
        const operatorName = url.searchParams.get('changedBy') || 'admin';
        const attestationPath = getAttestationPath(shopId);

        try {
            if (fs.existsSync(attestationPath)) {
                fs.unlinkSync(attestationPath);
            }
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'EROFS' || code === 'EACCES') {
                return NextResponse.json(
                    { error: 'Attestation storage is not writable in this environment' },
                    { status: 503 }
                );
            }
            throw error;
        }

        // Log audit event with the actual operator name
        connection = await getPosDb(shopId);
        await insertAuditEvent(connection, {
            event_type: 'attestation_removed',
            entity_type: 'attestation',
            entity_id: 'nf525',
            user_name: operatorName,
            detail: `Signed attestation PDF removed for shop ${shopId || 'default'}`,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing attestation:', error);
        return NextResponse.json({ error: 'Failed to remove attestation' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
