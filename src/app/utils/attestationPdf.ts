import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PUBLISHER } from './constants';
import { getSoftwareName, getSoftwareVersion } from './version';

export interface AttestationShopData {
    name: string;
    address: string;
    zipCode: string;
    city: string;
    serial: string;
    vatNumber: string;
    naf: string;
    legalForm: string;
    legalRepresentative: string;
}

export interface AttestationData {
    shop: AttestationShopData;
    softwareReleaseDate?: string;
    majorVersionRoot?: string;
    minorVersionSubdivision?: string;
    /** Publisher signature image (PNG bytes), embedded in Volet 1. */
    publisherSignaturePng?: Uint8Array;
    /** Shop signature image (PNG bytes), embedded in Volet 2. */
    shopSignaturePng?: Uint8Array;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const FONT_SIZE = 10;
const LINE_HEIGHT = 14;
const TITLE_SIZE = 14;
const SECTION_SIZE = 12;

/**
 * Wrap text to fit within a given width using the provided font.
 * Returns an array of lines.
 */
function wrapText(
    text: string,
    font: { widthOfTextAtSize: (text: string, size: number) => number },
    size: number,
    maxWidth: number
): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, size);
        if (width <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

/**
 * Build the BOI-LETTRE-000242 attestation PDF with two volets on separate pages:
 * - Page 1: Volet 1 — filled by the éditeur (publisher), with publisher signature
 * - Page 2: Volet 2 — filled by the entreprise utilisatrice (shop), with shop signature
 *
 * Signature images (PNG) are embedded if provided.
 */
export async function buildAttestationPdf(data: AttestationData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const softwareName = getSoftwareName() || 'Tradiz';
    const softwareVersion = getSoftwareVersion() || 'inconnue';
    const now = new Date();
    const today = now.toLocaleDateString('fr-FR');

    pdfDoc.setTitle(`Attestation de conformité - ${softwareName} v${softwareVersion}`);
    pdfDoc.setAuthor(PUBLISHER.raisonSociale);
    pdfDoc.setSubject("Attestation individuelle de l'éditeur (BOI-LETTRE-000242)");
    pdfDoc.setProducer('Tradiz');
    pdfDoc.setCreator('Tradiz');

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Embed publisher signature if available
    let publisherSignatureImg: Awaited<ReturnType<typeof pdfDoc.embedPng>> | undefined;
    if (data.publisherSignaturePng) {
        try {
            publisherSignatureImg = await pdfDoc.embedPng(data.publisherSignaturePng);
        } catch {
            // Ignore invalid PNG
        }
    }

    // Embed shop signature if available
    let shopSignatureImg: Awaited<ReturnType<typeof pdfDoc.embedPng>> | undefined;
    if (data.shopSignaturePng) {
        try {
            shopSignatureImg = await pdfDoc.embedPng(data.shopSignaturePng);
        } catch {
            // Ignore invalid PNG
        }
    }

    // ── Page 1: Volet 1 — Éditeur ──
    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const drawText = (text: string, x: number, size = FONT_SIZE, useBold = false) => {
        page.drawText(text, { x, y, size, font: useBold ? bold : font, color: rgb(0, 0, 0) });
    };

    const drawWrapped = (text: string, x: number, size = FONT_SIZE, useBold = false, indent = 0) => {
        const maxWidth = CONTENT_WIDTH - indent;
        const lines = wrapText(text, useBold ? bold : font, size, maxWidth);
        for (const line of lines) {
            if (y < MARGIN + LINE_HEIGHT) {
                page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                y = PAGE_HEIGHT - MARGIN;
            }
            page.drawText(line, { x: x + indent, y, size, font: useBold ? bold : font, color: rgb(0, 0, 0) });
            y -= LINE_HEIGHT;
        }
    };

    const drawSeparator = () => {
        if (y < MARGIN + LINE_HEIGHT * 2) {
            page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            y = PAGE_HEIGHT - MARGIN;
        }
        page.drawLine({
            start: { x: MARGIN, y },
            end: { x: PAGE_WIDTH - MARGIN, y },
            thickness: 0.5,
            color: rgb(0.5, 0.5, 0.5),
        });
        y -= LINE_HEIGHT * 1.5;
    };

    const spacer = (lines = 1) => {
        y -= LINE_HEIGHT * lines;
    };

    // ── Title ──
    drawText("ATTESTATION INDIVIDUELLE DE L'ÉDITEUR", MARGIN, TITLE_SIZE, true);
    y -= LINE_HEIGHT;
    drawText('Conformité aux conditions prévues au 3° bis du I de l\u2019article 286 du CGI', MARGIN, FONT_SIZE - 1);
    y -= LINE_HEIGHT;
    drawText('(Modèle BOI-LETTRE-000242)', MARGIN, FONT_SIZE - 1);
    spacer(2);

    const ref = `ATT-${softwareName.toUpperCase()}-${softwareVersion}-${now.toISOString().substring(0, 10)}`;
    drawText(`Référence : ${ref}`, MARGIN, FONT_SIZE, true);
    spacer(2);

    drawSeparator();

    // ── Volet 1 — Éditeur ──
    drawText('VOLET 1 — À REMPLIR PAR L\u2019ÉDITEUR', MARGIN, SECTION_SIZE, true);
    spacer(1);

    const publisherName =
        `${PUBLISHER.representantPrenom} ${PUBLISHER.representantNom}`.trim() || '[Nom Prénom du représentant légal]';
    drawWrapped(`Je soussigné, ${publisherName}, représentant légal de la société ${PUBLISHER.raisonSociale},`, MARGIN);
    drawWrapped(
        `éditeur du logiciel / système de caisse ${softwareName}, version n° ${softwareVersion}${
            data.softwareReleaseDate ? `, mis sur le marché à compter du ${data.softwareReleaseDate}` : ''
        },`,
        MARGIN
    );
    drawWrapped(`sous le numéro de licence ${PUBLISHER.licence},`, MARGIN);
    drawWrapped(
        'atteste que ce logiciel / système, ou les fonctionnalités de caisse de ce logiciel / système, satisfait aux conditions d\u2019inaltérabilité, de sécurisation, de conservation et d\u2019archivage des données en vue du contrôle de l\u2019administration fiscale, prévues au 3° bis du I de l\u2019article 286 du code général des impôts.',
        MARGIN
    );
    spacer(1);

    // ISCA conditions detail
    drawWrapped('Détail des conditions satisfaites :', MARGIN, FONT_SIZE, true);
    spacer(0.5);
    drawWrapped(
        '• Inaltérabilité : hachage chaîné SHA-256 des transactions (incluant le contenu des lignes : articles, quantités, prix, TVA, remises) et des événements d\u2019audit ; les hachages de clôtures sont ancrés à la chaîne des transactions (premier et dernier hachage de la période) ; les modifications de données fiscales sont tracées par des événements d\u2019audit chaînés.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Sécurisation : les données de caisse sont protégées par hachage ; les opérations sensibles (suppression, modification, clôture) sont journalisées dans audit_events avec horodatage et opérateur ; les changements de prix et de taux de TVA des articles sont historisés (product_price_history).',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Conservation : les transactions, clôtures journalières/mensuelles/annuelles et événements d\u2019audit sont conservés ; un export d\u2019archive fiscale est disponible.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Archivage : les données sont conservées dans la base de données de l\u2019exploitant selon la durée prévue par la réglementation ; un export d\u2019archive est disponible pour le contrôle de l\u2019administration.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    spacer(1);

    // Optional version root statement
    if (data.majorVersionRoot) {
        drawWrapped(
            `J\u2019atteste que la dernière version majeure de ce logiciel ou système est identifiée avec la racine suivante : ${data.majorVersionRoot} et que les versions mineures développées ultérieurement à cette version majeure sont ou seront identifiées par les subdivisions suivantes de cette racine : ${data.minorVersionSubdivision || '[subdivisions]'}. Je m\u2019engage à ce que ces subdivisions ne soient utilisées par ${PUBLISHER.raisonSociale} que pour l\u2019identification des versions mineures ultérieures, à l\u2019exclusion de toute version majeure.`,
            MARGIN
        );
        spacer(1);
    }

    // Limits (honesty section)
    drawWrapped('Limites connues à la date de génération :', MARGIN, FONT_SIZE, true);
    spacer(0.5);
    drawWrapped(
        '• L\u2019outil de vérification d\u2019intégrité contrôle l\u2019ensemble des chaînes (transactions, clôtures journalières/mensuelles/annuelles, événements d\u2019audit). Une modification légitime post-clôture d\u2019un jour scellé (ex. annulation tardive) est détectée comme un écart : c\u2019est le comportement attendu du scellement, la trace d\u2019audit explique le changement.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Les protections au niveau base de données (rôle applicatif restreint, triggers append-only) sont fournies sous forme de scripts et doivent être appliquées par l\u2019exploitant sur sa base ; sans elles, un administrateur de la base peut modifier directement les tables, ce qui resterait détectable par la vérification d\u2019intégrité.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Les lignes de transactions sont physiquement supprimées puis réinsérées lors des synchronisations ; un événement d\u2019audit transaction_items_replaced conserve l\u2019état antérieur.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Cette attestation est une auto-attestation de l\u2019éditeur. Elle ne constitue pas une certification NF525 délivrée par un organisme accrédité (ex. LNE).',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    spacer(2);

    drawWrapped(`Fait à ${PUBLISHER.ville || '[Ville]'}, le ${today}`, MARGIN);
    spacer(2);
    drawWrapped('Signature du représentant légal de l\u2019éditeur', MARGIN);
    spacer(1);

    // Embed publisher signature image if available
    if (publisherSignatureImg) {
        const imgWidth = 200;
        const imgHeight = (publisherSignatureImg.height / publisherSignatureImg.width) * imgWidth;
        page.drawImage(publisherSignatureImg, {
            x: MARGIN,
            y: Math.max(MARGIN, y - imgHeight),
            width: imgWidth,
            height: imgHeight,
        });
        y -= imgHeight + LINE_HEIGHT;
    } else {
        spacer(3);
    }

    // ── Page 2: Volet 2 — Utilisateur ──
    // Force a new page for Volet 2
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;

    drawText('VOLET 2 — À REMPLIR PAR L\u2019ENTREPRISE UTILISATRICE', MARGIN, SECTION_SIZE, true);
    spacer(1);

    const shopLine1 = data.shop.name || '[Raison sociale de l\u2019entreprise utilisatrice]';
    const shopRep = data.shop.legalRepresentative || '[Nom Prénom]';
    drawWrapped(`Je soussigné, ${shopRep}, représentant légal de la société ${shopLine1},`, MARGIN);
    drawWrapped(
        `certifie avoir acquis ou téléchargé le ${today}, auprès de ${PUBLISHER.raisonSociale}, le logiciel / système de caisse mentionné au volet 1 de cette attestation.`,
        MARGIN
    );
    drawWrapped(
        'J\u2019atteste utiliser ce logiciel / système de caisse pour enregistrer les règlements de mes clients particuliers, conformément à la réglementation fiscale en vigueur.',
        MARGIN
    );
    spacer(1);

    // Shop identity
    drawWrapped('Identité de l\u2019entreprise utilisatrice :', MARGIN, FONT_SIZE, true);
    spacer(0.5);
    if (data.shop.name) {
        drawWrapped(`Nom : ${data.shop.name}`, MARGIN, FONT_SIZE, false, 10);
    }
    if (data.shop.address) {
        drawWrapped(`Adresse : ${data.shop.address}`, MARGIN, FONT_SIZE, false, 10);
    }
    if (data.shop.zipCode || data.shop.city) {
        drawWrapped(`${data.shop.zipCode} ${data.shop.city}`.trim(), MARGIN, FONT_SIZE, false, 10);
    }
    if (data.shop.serial) {
        drawWrapped(`SIRET : ${data.shop.serial}`, MARGIN, FONT_SIZE, false, 10);
    }
    if (data.shop.vatNumber) {
        drawWrapped(`TVA Intracom : ${data.shop.vatNumber}`, MARGIN, FONT_SIZE, false, 10);
    }
    if (data.shop.naf) {
        drawWrapped(`NAF : ${data.shop.naf}`, MARGIN, FONT_SIZE, false, 10);
    }
    if (data.shop.legalForm) {
        drawWrapped(`Forme juridique : ${data.shop.legalForm}`, MARGIN, FONT_SIZE, false, 10);
    }
    if (data.shop.legalRepresentative) {
        drawWrapped(`Représentant légal : ${data.shop.legalRepresentative}`, MARGIN, FONT_SIZE, false, 10);
    }
    spacer(2);

    drawWrapped(`Fait à ${data.shop.city || '[Ville]'}, le ${today}`, MARGIN);
    spacer(2);
    drawWrapped('Signature du représentant légal de l\u2019entreprise utilisatrice', MARGIN);
    spacer(1);

    // Embed shop signature image if available
    if (shopSignatureImg) {
        const imgWidth = 200;
        const imgHeight = (shopSignatureImg.height / shopSignatureImg.width) * imgWidth;
        page.drawImage(shopSignatureImg, {
            x: MARGIN,
            y: Math.max(MARGIN, y - imgHeight),
            width: imgWidth,
            height: imgHeight,
        });
    }

    return pdfDoc.save();
}
