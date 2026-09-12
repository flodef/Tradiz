import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getPosDb, type DbConnection } from '../db';
import { insertAuditEvent } from '../auditHelpers';
import { buildAttestationPdf, type AttestationShopData } from '@/app/utils/attestationPdf';
import { getSoftwareVersion } from '@/app/utils/version';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const ATTESTATION_FILENAME_PREFIX = 'attestation_nf525';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const PDF_MAGIC = Buffer.from('%PDF-', 'utf8');
const PUBLISHER_SIGNATURE_PATH = path.join(process.cwd(), 'public', 'signature-editeur.png');

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

/** Extract the major version (first digit) from a version string like "1.527.0". */
function getMajorVersion(): string {
    const version = getSoftwareVersion() || '0';
    return version.split('.')[0] || '0';
}

/** Load the publisher signature PNG from public/signature-editeur.png if it exists. */
function loadPublisherSignature(): Uint8Array | undefined {
    try {
        if (fs.existsSync(PUBLISHER_SIGNATURE_PATH)) {
            return new Uint8Array(fs.readFileSync(PUBLISHER_SIGNATURE_PATH));
        }
    } catch {
        // Ignore
    }
    return undefined;
}

/** Convert a PNG data URL to Uint8Array. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(',')[1] || '';
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

async function fetchShopData(connection: DbConnection): Promise<AttestationShopData> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const [paramRows] = await connection.execute(
        `SELECT param_key, param_value FROM ${prefix}parameters WHERE param_key IN ('name', 'serial', 'vatNumber', 'address', 'zipCode', 'city', 'naf', 'legalForm', 'legalRepresentative')`
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
        legalRepresentative: params.get('legalRepresentative') || '',
    };
}

/** Fetch the stored signature data and version from the DB. */
async function fetchSignatureData(
    connection: DbConnection
): Promise<{ signatureData: string | null; signatureVersion: string | null }> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    const [rows] = await connection.execute(
        `SELECT param_key, param_value FROM ${prefix}parameters WHERE param_key IN ('signatureData', 'signatureVersion')`
    );
    const params = new Map<string, string>();
    for (const row of rows as { param_key: string; param_value: string }[]) {
        params.set(row.param_key, row.param_value);
    }
    return {
        signatureData: params.get('signatureData') || null,
        signatureVersion: params.get('signatureVersion') || null,
    };
}

/** Upsert a parameter key/value into the DB. */
async function upsertParameter(connection: DbConnection, key: string, value: string): Promise<void> {
    const isPg = connection.isPostgreSQL;
    const prefix = isPg ? 'dc_pos.' : '';
    if (isPg) {
        // PostgreSQL: use ON CONFLICT for a proper atomic upsert
        await connection.execute(
            `INSERT INTO ${prefix}parameters (param_key, param_value) VALUES ($1, $2)
             ON CONFLICT (param_key) DO UPDATE SET param_value = EXCLUDED.param_value`,
            [key, value]
        );
    } else {
        // MariaDB: try update first, then insert if no row was affected
        const updateQuery = `UPDATE ${prefix}parameters SET param_value = ? WHERE param_key = ?`;
        const insertQuery = `INSERT INTO ${prefix}parameters (param_key, param_value) VALUES (?, ?)`;
        const [result] = await connection.execute(updateQuery, [value, key]);
        const affected = (result as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
        if (affected === 0) {
            await connection.execute(insertQuery, [key, value]);
        }
    }
}

/**
 * GET — returns attestation status, or the PDF file (signed or generated).
 *
 * - No query param: returns { signed, needsResign, majorVersion, signatureVersion }
 * - ?action=view: returns the signed PDF (inline) if it exists, or 404
 * - ?action=generate: generates and returns the PDF with publisher signature (inline)
 */
export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const attestationPath = getAttestationPath(shopId);
    const majorVersion = getMajorVersion();

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
            const publisherSignaturePng = loadPublisherSignature();
            const pdfBytes = await buildAttestationPdf({ shop, publisherSignaturePng });
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
    let connection: DbConnection | undefined;
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

        // Check if re-signature is needed (major version changed)
        let needsResign = !exists;
        let signatureVersion: string | null = null;
        try {
            connection = await getPosDb(shopId);
            const sigData = await fetchSignatureData(connection);
            signatureVersion = sigData.signatureVersion;
            if (exists && signatureVersion && signatureVersion !== majorVersion) {
                needsResign = true;
            }
        } catch {
            // Ignore DB errors — assume no resign needed
        }

        return NextResponse.json({ signed: exists, generatedAt, needsResign, majorVersion, signatureVersion });
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EROFS' || code === 'EACCES') {
            return NextResponse.json({
                signed: false,
                generatedAt: null,
                needsResign: true,
                majorVersion,
                signatureVersion: null,
            });
        }
        console.error('Error checking attestation status:', error);
        return NextResponse.json({ error: 'Failed to check attestation status' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}

/**
 * POST — accepts either an electronic signature (JSON) or a signed PDF upload (form-data).
 *
 * JSON mode: { signatureData: string (PNG data URL), changedBy?: string }
 *   Generates a signed PDF with both publisher and shop signatures, saves it,
 *   and stores the signature data + version in the parameters table.
 *
 * Form-data mode: file upload (backward compatible with the old flow).
 */
export async function POST(request: Request) {
    const shopId = getShopIdFromRequest(request);
    let connection: DbConnection | undefined;
    const contentType = request.headers.get('content-type') || '';

    // ── JSON mode: electronic signature ──
    if (contentType.includes('application/json')) {
        try {
            const body = await request.json();
            const { signatureData, changedBy } = body as { signatureData?: string; changedBy?: string };

            const MAX_SIGNATURE_LENGTH = 700 * 1024; // ~512 KB of base64 PNG data
            if (
                !signatureData ||
                !signatureData.startsWith('data:image/png;base64,') ||
                signatureData.length > MAX_SIGNATURE_LENGTH
            ) {
                return NextResponse.json({ error: 'Invalid signature data' }, { status: 400 });
            }

            const operatorName = changedBy || 'admin';
            const majorVersion = getMajorVersion();
            const shopSignaturePng = dataUrlToBytes(signatureData);
            const publisherSignaturePng = loadPublisherSignature();

            connection = await getPosDb(shopId);
            const shop = await fetchShopData(connection);

            // Generate the signed PDF with both signatures
            const pdfBytes = await buildAttestationPdf({ shop, publisherSignaturePng, shopSignaturePng });
            const pdfBuffer = Buffer.from(pdfBytes);

            // Save the signed PDF
            const attestationPath = getAttestationPath(shopId);
            try {
                fs.writeFileSync(attestationPath, pdfBuffer);
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

            // Save signature data + version to DB
            await upsertParameter(connection, 'signatureData', signatureData);
            await upsertParameter(connection, 'signatureVersion', majorVersion);

            // Log audit event
            await insertAuditEvent(connection, {
                event_type: 'attestation_signed',
                entity_type: 'attestation',
                entity_id: 'nf525',
                user_name: operatorName,
                detail: `Electronic signature applied (version ${majorVersion}) for shop ${shopId || 'default'}`,
            });

            return NextResponse.json({ success: true });
        } catch (error) {
            console.error('Error signing attestation electronically:', error);
            return NextResponse.json({ error: 'Failed to sign attestation' }, { status: 500 });
        } finally {
            await connection?.end();
        }
    }

    // ── Form-data mode: file upload (backward compatible) ──
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                { error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` },
                { status: 413 }
            );
        }

        const fileBuffer = Buffer.from(await file.arrayBuffer());

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

        connection = await getPosDb(shopId);
        await insertAuditEvent(connection, {
            event_type: 'attestation_signed',
            entity_type: 'attestation',
            entity_id: 'nf525',
            user_name: operatorName,
            detail: `Signed attestation PDF uploaded (${fileBuffer.length} bytes) for shop ${shopId || 'default'}`,
        });
        await upsertParameter(connection, 'signatureVersion', getMajorVersion());

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error uploading attestation:', error);
        return NextResponse.json({ error: 'Failed to upload attestation' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}

/**
 * DELETE — removes the signed attestation PDF and clears signature data.
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
            fs.unlinkSync(attestationPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }

        // Clear signature data from DB
        try {
            connection = await getPosDb(shopId);
            await upsertParameter(connection, 'signatureData', '');
            await upsertParameter(connection, 'signatureVersion', '');
        } catch {
            // Ignore DB errors
        }

        // Log audit event
        if (connection) {
            await insertAuditEvent(connection, {
                event_type: 'attestation_removed',
                entity_type: 'attestation',
                entity_id: 'nf525',
                user_name: operatorName,
                detail: `Signed attestation PDF removed for shop ${shopId || 'default'}`,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing attestation:', error);
        return NextResponse.json({ error: 'Failed to remove attestation' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
