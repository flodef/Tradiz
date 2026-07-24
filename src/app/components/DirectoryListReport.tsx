'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { IconPrinter, IconX } from '@tabler/icons-react';
import { formatFrenchDate } from '@/app/utils/date';
import { generateEan13Barcode } from '@/app/utils/barcode';
import { Shop } from '@/app/contexts/ConfigProvider';

export interface DirectoryEntry {
    id: number;
    name: string;
    reference: string;
}

export interface DirectoryListReportProps {
    title: string;
    entries: DirectoryEntry[];
    shop: Shop;
    onClose: () => void;
    printLabel?: string;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export const DirectoryListReport: FC<DirectoryListReportProps> = ({
    title,
    entries,
    shop,
    onClose,
    printLabel = 'Imprimer / PDF',
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isReady, setIsReady] = useState(false);

    const rows = useMemo(
        () =>
            entries
                .filter((e) => e.name?.trim())
                .map((e) => ({
                    ...e,
                    name: e.name.trim(),
                    barcodeSvg: generateEan13Barcode(e.reference || '', 160, 64),
                }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [entries]
    );

    const reportDate = useMemo(() => formatFrenchDate(new Date()).frenchDateStr, []);

    const printableHtml = useMemo(() => {
        const shopName = escapeHtml(shop.name || '');
        const shopAddress = [shop.address, shop.zipCode && shop.city ? `${shop.zipCode} ${shop.city}` : shop.city]
            .filter(Boolean)
            .join(', ');
        const bodyRows = rows
            .map(
                (e, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(e.name)}</td>
                    <td>${escapeHtml(e.reference)}</td>
                    <td class="barcode-cell">${e.barcodeSvg}</td>
                </tr>`
            )
            .join('');

        return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
        @page { size: A4 portrait; margin: 15mm; }
        * { box-sizing: border-box; }
        body {
            font-family: Arial, sans-serif;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 0;
            font-size: 11pt;
        }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { margin: 0 0 6px 0; font-size: 18pt; }
        .header .shop { font-weight: bold; font-size: 13pt; }
        .header .meta { color: #555; font-size: 10pt; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; vertical-align: middle; }
        th { background: #f0f0f0; font-weight: bold; font-size: 10pt; }
        td { font-size: 10pt; }
        .barcode-cell { text-align: center; padding: 6px; }
        .barcode-cell svg { max-width: 100%; height: 42px; }
        .col-index { width: 40px; text-align: center; }
        .col-name { width: auto; }
        .col-ref { width: 120px; }
        .col-barcode { width: 180px; }
        .footer { margin-top: 24px; font-size: 9pt; color: #666; text-align: center; }
        @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="shop">${shopName}</div>
        ${shopAddress ? `<div>${escapeHtml(shopAddress)}</div>` : ''}
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">Imprimé le ${reportDate}</div>
    </div>
    <table>
        <thead>
            <tr>
                <th class="col-index">N°</th>
                <th class="col-name">Nom</th>
                <th class="col-ref">Référence</th>
                <th class="col-barcode">Code-barres</th>
            </tr>
        </thead>
        <tbody>
            ${bodyRows || '<tr><td colspan="4" style="text-align:center;">Aucune entrée</td></tr>'}
        </tbody>
    </table>
    <div class="footer">Document généré par Tradiz</div>
</body>
</html>`;
    }, [rows, shop, title, reportDate]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        doc.open();
        doc.write(printableHtml);
        doc.close();
        setIsReady(true);
    }, [printableHtml]);

    const handlePrint = useCallback(() => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        win.focus();
        win.print();
    }, []);

    const handleClose = useCallback(() => {
        onClose();
    }, [onClose]);

    return (
        <div className="flex flex-col items-stretch w-full max-w-4xl mx-auto p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-popup-dark dark:text-popup-dark">{title}</h2>
                <div className="flex gap-2">
                    <button
                        onClick={handlePrint}
                        disabled={!isReady || rows.length === 0}
                        className={twMerge(
                            'flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white',
                            'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                    >
                        <IconPrinter size={20} />
                        {printLabel}
                    </button>
                    <button
                        onClick={handleClose}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-gray-500 hover:bg-gray-600 active:bg-gray-700"
                    >
                        <IconX size={20} />
                        Fermer
                    </button>
                </div>
            </div>

            <div className="bg-white text-black rounded-lg p-6 shadow-md overflow-x-auto print-area">
                <div className="text-center mb-4">
                    <div className="font-bold text-lg">{shop.name}</div>
                    {shop.address && <div className="text-sm text-gray-600">{shop.address}</div>}
                    {shop.zipCode && shop.city && (
                        <div className="text-sm text-gray-600">
                            {shop.zipCode} {shop.city}
                        </div>
                    )}
                    <h1 className="text-2xl font-bold mt-2">{title}</h1>
                    <div className="text-sm text-gray-500 mt-1">Imprimé le {reportDate}</div>
                </div>

                <table className="w-full border-collapse border border-gray-300">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-3 py-2 text-left w-12">N°</th>
                            <th className="border border-gray-300 px-3 py-2 text-left">Nom</th>
                            <th className="border border-gray-300 px-3 py-2 text-left w-36">Référence</th>
                            <th className="border border-gray-300 px-3 py-2 text-center w-48">Code-barres</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="border border-gray-300 px-3 py-4 text-center text-gray-500">
                                    Aucune entrée
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, index) => (
                                <tr key={row.id || index} className="even:bg-gray-50">
                                    <td className="border border-gray-300 px-3 py-2 text-center">{index + 1}</td>
                                    <td className="border border-gray-300 px-3 py-2">{row.name}</td>
                                    <td className="border border-gray-300 px-3 py-2 font-mono text-sm">
                                        {row.reference}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-2">
                                        <div
                                            className="flex justify-center"
                                            dangerouslySetInnerHTML={{ __html: row.barcodeSvg }}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <iframe
                ref={iframeRef}
                title="directory-list-print"
                className="absolute w-0 h-0 border-0"
                style={{ left: '-9999px' }}
            />
        </div>
    );
};
