'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { IconPrinter, IconUpload, IconTrash } from '@tabler/icons-react';
import AdminButton from './admin/AdminButton';
import { usePopup } from '../hooks/usePopup';
import { useIsMobile } from '../utils/mobile';

interface AttestationViewerProps {
    /** Whether a signed PDF already exists on the server. */
    signed: boolean;
    /** Called after a successful upload to refresh the parent's status. */
    onStatusChange?: (signed: boolean) => void;
}

/**
 * Displays the attestation PDF in a fullscreen popup.
 *
 * - If `signed` is true, shows the uploaded signed PDF (`?action=view`).
 * - If `signed` is false, generates and shows the unsigned PDF (`?action=generate`).
 *
 * Provides print, upload (when unsigned), and delete (when signed) buttons
 * in the popup header, following the same pattern as DirectoryListReport.
 */
export const AttestationViewer: FC<AttestationViewerProps> = ({ signed, onStatusChange }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isReady, setIsReady] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const { setPopupHeaderExtra, setPopupWide, closePopup } = usePopup();
    const isMobile = useIsMobile();

    const pdfUrl = signed ? '/api/sql/attestation?action=view' : '/api/sql/attestation?action=generate';

    useEffect(() => {
        setIsReady(false);
    }, [pdfUrl]);

    const handlePrint = useCallback(() => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        win.focus();
        win.print();
    }, []);

    const handleUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setIsUploading(true);
            setUploadError(null);
            try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch('/api/sql/attestation', { method: 'POST', body: formData });
                if (!res.ok) throw new Error('Upload failed');
                onStatusChange?.(true);
                closePopup();
            } catch {
                setUploadError('Échec de l’import du PDF signé');
            } finally {
                setIsUploading(false);
            }
        },
        [onStatusChange, closePopup]
    );

    const handleDelete = useCallback(async () => {
        try {
            const res = await fetch('/api/sql/attestation', { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            onStatusChange?.(false);
            closePopup();
        } catch {
            setUploadError('Échec de la suppression');
        }
    }, [onStatusChange, closePopup]);

    useEffect(() => {
        if (!setPopupHeaderExtra) return;
        setPopupWide?.(true);
        setPopupHeaderExtra(
            <div className="flex items-center gap-2">
                <AdminButton
                    onClick={handlePrint}
                    disabled={!isReady}
                    className={isMobile ? 'px-3 py-1.5 mt-0' : 'px-3 py-1 mt-0'}
                >
                    {isMobile ? (
                        <IconPrinter size={24} />
                    ) : (
                        <>
                            <IconPrinter size={20} />
                            Imprimer
                        </>
                    )}
                </AdminButton>
                {!signed && (
                    <>
                        <input
                            type="file"
                            accept=".pdf,application/pdf"
                            ref={fileInputRef}
                            onChange={handleUpload}
                            className="hidden"
                        />
                        <AdminButton
                            variant="add"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            isLoading={isUploading}
                            className={isMobile ? 'px-3 py-1.5 mt-0' : 'px-3 py-1 mt-0'}
                        >
                            {isMobile ? (
                                <IconUpload size={24} />
                            ) : (
                                <>
                                    <IconUpload size={20} />
                                    Importer la version signée
                                </>
                            )}
                        </AdminButton>
                    </>
                )}
                {signed && (
                    <AdminButton
                        variant="danger"
                        onClick={handleDelete}
                        className={isMobile ? 'px-3 py-1.5 mt-0' : 'px-3 py-1 mt-0'}
                    >
                        {isMobile ? (
                            <IconTrash size={24} />
                        ) : (
                            <>
                                <IconTrash size={20} />
                                Supprimer
                            </>
                        )}
                    </AdminButton>
                )}
            </div>
        );
        return () => {
            setPopupHeaderExtra(undefined);
            setPopupWide?.(false);
        };
    }, [
        setPopupHeaderExtra,
        setPopupWide,
        handlePrint,
        handleUpload,
        handleDelete,
        isReady,
        isUploading,
        signed,
        isMobile,
    ]);

    return (
        <div className="flex flex-col items-stretch w-full max-w-6xl mx-auto p-4">
            {uploadError && (
                <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-sm">{uploadError}</div>
            )}
            <div className="bg-white rounded-lg p-4 shadow-md">
                <iframe
                    ref={iframeRef}
                    src={pdfUrl}
                    title="attestation-pdf"
                    className="w-full border-0"
                    style={{ height: '70vh' }}
                    onLoad={() => setIsReady(true)}
                />
            </div>
            {!signed && (
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center">
                    Ce document est généré sans signatures. Imprimez-le, signez-le, puis importez la
                    version signée pour valider l’attestation.
                </p>
            )}
        </div>
    );
};
