'use client';

import { FC } from 'react';
import { LoadingBounce } from '@/app/loading';

export type UpdateStep = 'available' | 'downloading' | 'installing' | 'restarting';

interface UpdateScreenProps {
    step: UpdateStep;
    version?: string;
    onAccept?: () => void;
    onDismiss?: () => void;
}

const STEP_LABELS: Record<UpdateStep, string> = {
    available: 'Mise à jour disponible',
    downloading: 'Téléchargement en cours…',
    installing: 'Installation en cours…',
    restarting: 'Redémarrage en cours…',
};

const LoadingDots: FC = () => <LoadingBounce fullscreen={false} />;

export const UpdateScreen: FC<UpdateScreenProps> = ({ step, version, onAccept, onDismiss }) => {
    const showButtons = step === 'available';

    return (
        <div className="fixed inset-0 z-200 flex flex-col items-center justify-center bg-main-from-light dark:bg-main-from-dark text-main-to-light dark:text-main-to-dark">
            <div className="flex flex-col items-center gap-8">
                {version && (
                    <p className="text-2xl font-semibold opacity-80">
                        Mise à jour v{version.split('.').slice(0, 2).join('.')}
                    </p>
                )}

                <div className="flex flex-col items-center gap-4">
                    <p className="text-xl font-semibold">{STEP_LABELS[step]}</p>
                    {step !== 'available' && <LoadingDots />}
                </div>

                {showButtons && (
                    <div className="flex gap-4 mt-4">
                        <button
                            type="button"
                            onClick={onAccept}
                            className="px-8 py-3 rounded-xl font-semibold text-lg bg-secondary-active-light dark:bg-secondary-active-dark text-popup-dark dark:text-popup-light hover:opacity-80 transition-opacity"
                        >
                            Mettre à jour
                        </button>
                        <button
                            type="button"
                            onClick={onDismiss}
                            className="px-8 py-3 rounded-xl font-semibold text-lg border-2 border-current opacity-60 hover:opacity-100 transition-opacity"
                        >
                            Plus tard
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
