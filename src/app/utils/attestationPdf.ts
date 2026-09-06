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
}

export interface AttestationData {
    shop: AttestationShopData;
    softwareReleaseDate?: string;
    majorVersionRoot?: string;
    minorVersionSubdivision?: string;
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
 * Build the BOI-LETTRE-000242 attestation PDF with two volets:
 * - Volet 1: filled by the éditeur (publisher)
 * - Volet 2: filled by the entreprise utilisatrice (shop)
 *
 * In unsigned mode, all fields are filled from code/DB data but signature lines are blank.
 */
export async function buildAttestationPdf(data: AttestationData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const softwareName = getSoftwareName() || 'Tradiz';
    const softwareVersion = getSoftwareVersion() || 'inconnue';
    const today = new Date().toLocaleDateString('fr-FR');

    pdfDoc.setTitle(`Attestation de conformité - ${softwareName} v${softwareVersion}`);
    pdfDoc.setAuthor(PUBLISHER.raisonSociale);
    pdfDoc.setSubject("Attestation individuelle de l'éditeur (BOI-LETTRE-000242)");
    pdfDoc.setProducer('Tradiz');
    pdfDoc.setCreator('Tradiz');

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

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
    drawText('Conformité aux conditions prévues au 3° bis du I de l’article 286 du CGI', MARGIN, FONT_SIZE - 1);
    y -= LINE_HEIGHT;
    drawText('(Modèle BOI-LETTRE-000242)', MARGIN, FONT_SIZE - 1);
    spacer(2);

    const ref = `ATT-${softwareName.toUpperCase()}-${softwareVersion}-${new Date()
        .toISOString()
        .substring(0, 10)}`;
    drawText(`Référence : ${ref}`, MARGIN, FONT_SIZE, true);
    spacer(2);

    drawSeparator();

    // ── Volet 1 — Éditeur ──
    drawText('VOLET 1 — À REMPLIR PAR L’ÉDITEUR', MARGIN, SECTION_SIZE, true);
    spacer(1);

    const publisherName = `${PUBLISHER.representantPrenom} ${PUBLISHER.representantNom}`.trim() || '[Nom Prénom du représentant légal]';
    drawWrapped(
        `Je soussigné, ${publisherName}, représentant légal de la société ${PUBLISHER.raisonSociale},`,
        MARGIN
    );
    drawWrapped(
        `éditeur du logiciel / système de caisse ${softwareName}, version n° ${softwareVersion}${
            data.softwareReleaseDate ? `, mis sur le marché à compter du ${data.softwareReleaseDate}` : ''
        },`,
        MARGIN
    );
    drawWrapped(
        `sous le numéro de licence ${PUBLISHER.licence},`,
        MARGIN
    );
    drawWrapped(
        'atteste que ce logiciel / système, ou les fonctionnalités de caisse de ce logiciel / système, satisfait aux conditions d’inaltérabilité, de sécurisation, de conservation et d’archivage des données en vue du contrôle de l’administration fiscale, prévues au 3° bis du I de l’article 286 du code général des impôts.',
        MARGIN
    );
    spacer(1);

    // ISCA conditions detail
    drawWrapped('Détail des conditions satisfaites :', MARGIN, FONT_SIZE, true);
    spacer(0.5);
    drawWrapped(
        '• Inaltérabilité : hachage chaîné SHA-256 des transactions et des événements d’audit ; les modifications de données fiscales sont tracées par des événements d’audit chaînés.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Sécurisation : les données de caisse sont protégées par hachage ; les opérations sensibles (suppression, modification, clôture) sont journalisées dans audit_events avec horodatage et opérateur.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Conservation : les transactions, clôtures journalières/mensuelles/annuelles et événements d’audit sont conservés ; un export d’archive fiscale est disponible.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Archivage : les données sont conservées dans la base de données de l’exploitant selon la durée prévue par la réglementation ; un export d’archive est disponible pour le contrôle de l’administration.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    spacer(1);

    // Optional version root statement
    if (data.majorVersionRoot) {
        drawWrapped(
            `J’atteste que la dernière version majeure de ce logiciel ou système est identifiée avec la racine suivante : ${data.majorVersionRoot} et que les versions mineures développées ultérieurement à cette version majeure sont ou seront identifiées par les subdivisions suivantes de cette racine : ${data.minorVersionSubdivision || '[subdivisions]'}. Je m’engage à ce que ces subdivisions ne soient utilisées par ${PUBLISHER.raisonSociale} que pour l’identification des versions mineures ultérieures, à l’exclusion de toute version majeure.`,
            MARGIN
        );
        spacer(1);
    }

    // Limits (honesty section)
    drawWrapped('Limites connues à la date de génération :', MARGIN, FONT_SIZE, true);
    spacer(0.5);
    drawWrapped(
        '• La vérification de l’intégrité des clôtures et des événements d’audit est en cours d’implémentation ; seul le chaînage des transactions est actuellement vérifié par l’outil de contrôle.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Les lignes de transactions (articles, quantités, prix, TVA) ne sont pas incluses dans le hachage actuel ; cette inclusion est prévue dans une version ultérieure.',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    drawWrapped(
        '• Cette attestation est une auto-attestation de l’éditeur. Elle ne constitue pas une certification NF525 délivrée par un organisme accrédité (ex. LNE).',
        MARGIN,
        FONT_SIZE,
        false,
        10
    );
    spacer(2);

    drawWrapped(`Fait à ${PUBLISHER.ville || '[Ville]'}, le ${today}`, MARGIN);
    spacer(2);
    drawWrapped('Signature du représentant légal de l’éditeur', MARGIN);
    spacer(3);

    drawSeparator();

    // ── Volet 2 — Utilisateur ──
    drawText('VOLET 2 — À REMPLIR PAR L’ENTREPRISE UTILISATRICE', MARGIN, SECTION_SIZE, true);
    spacer(1);

    const shopLine1 = data.shop.name || '[Raison sociale de l’entreprise utilisatrice]';
    drawWrapped(
        `Je soussigné, [Nom Prénom], représentant légal de la société ${shopLine1},`,
        MARGIN
    );
    drawWrapped(
        `certifie avoir acquis ou téléchargé le ${today}, auprès de ${PUBLISHER.raisonSociale}, le logiciel / système de caisse mentionné au volet 1 de cette attestation.`,
        MARGIN
    );
    drawWrapped(
        'J’atteste utiliser ce logiciel / système de caisse pour enregistrer les règlements de mes clients particuliers, conformément à la réglementation fiscale en vigueur.',
        MARGIN
    );
    spacer(1);

    // Shop identity
    drawWrapped('Identité de l’entreprise utilisatrice :', MARGIN, FONT_SIZE, true);
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
    spacer(2);

    drawWrapped(`Fait à ${data.shop.city || '[Ville]'}, le ${today}`, MARGIN);
    spacer(2);
    drawWrapped('Signature du représentant légal de l’entreprise utilisatrice', MARGIN);

    return pdfDoc.save();
}
