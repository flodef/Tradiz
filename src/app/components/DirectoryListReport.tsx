'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconPrinter } from '@tabler/icons-react';
import { formatFrenchDate } from '@/app/utils/date';
import { escapeHtml, generateEan13Barcode } from '@/app/utils/barcode';
import { Shop } from '@/app/contexts/ConfigProvider';
import AdminButton from './admin/AdminButton';
import { usePopup } from '../hooks/usePopup';
import { useIsMobile } from '../utils/mobile';

export interface DirectoryEntry {
    id: number;
    name: string;
    reference: string;
}

export interface DirectoryListReportProps {
    title: string;
    entries: DirectoryEntry[];
    shop: Shop;
    printLabel?: string;
}

export const DirectoryListReport: FC<DirectoryListReportProps> = ({
    title,
    entries,
    shop,
    printLabel = 'Imprimer / PDF',
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isReady, setIsReady] = useState(false);
    const { setPopupHeaderExtra, setPopupWide } = usePopup();
    const isMobile = useIsMobile();

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
                (e) => `
                <tr>
                    <td>${escapeHtml(e.name)}</td>
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
        .barcode-cell svg { max-width: 100%; height: 56px; }
        .col-name { width: auto; }
        .col-barcode { width: 200px; }
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
                <th class="col-name">Nom</th>
                <th class="col-barcode">Code-barres</th>
            </tr>
        </thead>
        <tbody>
            ${bodyRows || '<tr><td colspan="2" style="text-align:center;">Aucune entrée</td></tr>'}
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

    useEffect(() => {
        if (!setPopupHeaderExtra) return;
        setPopupWide?.(true);
        setPopupHeaderExtra(
            <AdminButton
                onClick={handlePrint}
                disabled={!isReady || rows.length === 0}
                className={isMobile ? 'px-3 py-1.5 mt-0' : 'px-3 py-1 mt-0'}
            >
                {isMobile ? (
                    <IconPrinter size={24} />
                ) : (
                    <>
                        <IconPrinter size={20} />
                        {printLabel}
                    </>
                )}
            </AdminButton>
        );
        return () => {
            setPopupHeaderExtra(undefined);
            setPopupWide?.(false);
        };
    }, [setPopupHeaderExtra, setPopupWide, handlePrint, isReady, rows.length, isMobile, printLabel]);

    return (
        <div className="flex flex-col items-stretch w-full max-w-6xl mx-auto p-4">
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
                            {!isMobile && <th className="border border-gray-300 px-3 py-2 text-left w-12">N°</th>}
                            <th className="border border-gray-300 px-3 py-2 text-left">Nom</th>
                            {!isMobile && (
                                <th className="border border-gray-300 px-3 py-2 text-left w-36">Référence</th>
                            )}
                            <th className="border border-gray-300 px-3 py-2 text-center w-48">Code-barres</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={isMobile ? 2 : 4}
                                    className="border border-gray-300 px-3 py-4 text-center text-gray-500"
                                >
                                    Aucune entrée
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, index) => (
                                <tr key={row.id || index} className="even:bg-gray-50">
                                    {!isMobile && (
                                        <td className="border border-gray-300 px-3 py-2 text-center">{index + 1}</td>
                                    )}
                                    <td className="border border-gray-300 px-3 py-2">{row.name}</td>
                                    {!isMobile && (
                                        <td className="border border-gray-300 px-3 py-2 font-mono text-sm">
                                            {row.reference}
                                        </td>
                                    )}
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
