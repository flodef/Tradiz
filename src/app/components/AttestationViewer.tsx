'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { IconPrinter, IconUpload, IconTrash, IconSignature } from '@tabler/icons-react';
import AdminButton from './admin/AdminButton';
import { usePopup } from '../hooks/usePopup';
import { useIsMobile } from '../utils/mobile';
import { SignaturePad } from './SignaturePad';

interface AttestationViewerProps {
    /** Whether a signed PDF already exists on the server. */
    signed: boolean;
    /** Whether the user needs to re-sign (major version changed). */
    needsResign?: boolean;
    /** Called after a successful upload/sign to refresh the parent's status. */
    onStatusChange?: (signed: boolean) => void;
    /** The name of the current operator, used for audit events. */
    userName?: string;
}

/**
 * Displays the attestation PDF in a fullscreen popup.
 *
 * - If `signed` is true and no resign is needed, shows the signed PDF (`?action=view`).
 * - If `signed` is false or `needsResign` is true, shows the unsigned PDF (`?action=generate`)
 *   and offers electronic signature via the SignaturePad.
 *
 * Also supports print, file upload (backward compat), and delete buttons.
 */
export const AttestationViewer: FC<AttestationViewerProps> = ({ signed, needsResign, onStatusChange, userName }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isReady, setIsReady] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [showSignaturePad, setShowSignaturePad] = useState(false);
    const [signatureData, setSignatureData] = useState('');
    const { setPopupHeaderExtra, setPopupWide, closePopup, openFullscreenPopup } = usePopup();
    const isMobile = useIsMobile();

    const showUnsigned = !signed || needsResign;
    const pdfUrl = showUnsigned ? '/api/sql/attestation?action=generate' : '/api/sql/attestation?action=view';

    useEffect(() => {
        setIsReady(false);
    }, [pdfUrl]);

    const handlePrint = useCallback(() => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        win.focus();
        win.print();
    }, []);

    const handleElectronicSign = useCallback(async () => {
        if (!signatureData) {
            setUploadError('Veuillez apposer votre signature');
            return;
        }
        setIsUploading(true);
        setUploadError(null);
        try {
            const res = await fetch('/api/sql/attestation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signatureData,
                    changedBy: userName,
                }),
            });
            if (!res.ok) throw new Error('Sign failed');
            onStatusChange?.(true);
            closePopup();
        } catch {
            setUploadError('Échec de la signature électronique');
        } finally {
            setIsUploading(false);
        }
    }, [signatureData, userName, onStatusChange, closePopup]);

    const handleUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setIsUploading(true);
            setUploadError(null);
            try {
                const formData = new FormData();
                formData.append('file', file);
                if (userName) formData.append('changedBy', userName);
                const res = await fetch('/api/sql/attestation', { method: 'POST', body: formData });
                if (!res.ok) throw new Error('Upload failed');
                onStatusChange?.(true);
                closePopup();
            } catch {
                setUploadError('Échec de l\u2019import du PDF signé');
            } finally {
                setIsUploading(false);
            }
        },
        [onStatusChange, closePopup, userName]
    );

    const handleDelete = useCallback(() => {
        openFullscreenPopup("Supprimer l'attestation ?", ['Oui', 'Non'], (i) => {
            if (i !== 0) return;
            const deleteUrl = userName
                ? `/api/sql/attestation?changedBy=${encodeURIComponent(userName)}`
                : '/api/sql/attestation';
            fetch(deleteUrl, { method: 'DELETE' })
                .then((res) => {
                    if (!res.ok) throw new Error('Delete failed');
                    onStatusChange?.(false);
                    closePopup();
                })
                .catch(() => setUploadError('Échec de la suppression'));
        });
    }, [openFullscreenPopup, onStatusChange, closePopup, userName]);

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
                {showUnsigned && !showSignaturePad && (
                    <>
                        <AdminButton
                            variant="primary"
                            onClick={() => setShowSignaturePad(true)}
                            className={isMobile ? 'px-3 py-1.5 mt-0' : 'px-3 py-1 mt-0'}
                        >
                            {isMobile ? (
                                <IconSignature size={24} />
                            ) : (
                                <>
                                    <IconSignature size={20} />
                                    Signer électroniquement
                                </>
                            )}
                        </AdminButton>
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
                                    Importer PDF signé
                                </>
                            )}
                        </AdminButton>
                    </>
                )}
                {showUnsigned && showSignaturePad && (
                    <AdminButton
                        variant="add"
                        onClick={handleElectronicSign}
                        disabled={isUploading || !signatureData}
                        isLoading={isUploading}
                        className={isMobile ? 'px-3 py-1.5 mt-0' : 'px-3 py-1 mt-0'}
                    >
                        {isMobile ? (
                            <IconSignature size={24} />
                        ) : isUploading ? (
                            <>Validation en cours...</>
                        ) : (
                            <>
                                <IconSignature size={20} />
                                Valider la signature
                            </>
                        )}
                    </AdminButton>
                )}
                {signed && !needsResign && (
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
        handleElectronicSign,
        isReady,
        isUploading,
        signed,
        needsResign,
        showUnsigned,
        showSignaturePad,
        signatureData,
        isMobile,
    ]);

    return (
        <div className="flex flex-col items-stretch w-full max-w-6xl mx-auto p-4">
            {uploadError && <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-sm">{uploadError}</div>}
            {showSignaturePad && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-blue-300 dark:border-blue-700">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Apposez votre signature ci-dessous
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        Signez avec votre doigt (tactile) ou votre souris. Cette signature sera intégrée au Volet 2 du
                        document et enregistrée pour réutilisation.
                    </p>
                    <SignaturePad onChange={setSignatureData} width={isMobile ? 300 : 600} height={240} />
                </div>
            )}
            {!showSignaturePad && (
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
            )}
            {showUnsigned && !showSignaturePad && (
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center">
                    Ce document est généré avec la signature de l'éditeur (Volet 1). Signez électroniquement le Volet 2
                    ou importez un PDF signé pour valider l'attestation.
                </p>
            )}
            {needsResign && signed && (
                <p className="mt-3 text-sm text-orange-600 text-center">
                    Une nouvelle signature est requise car la version majeure du logiciel a changé.
                </p>
            )}
        </div>
    );
};
