'use client';

import { usePopup } from './usePopup';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Shared hook for the "unsaved changes" confirmation popup.
 * Used by AdminPageLayout (close button) and TopNav (navigation links).
 */
export function useUnsavedChanges() {
    const { openFullscreenPopup } = usePopup();
    const router = useRouter();

    const confirmUnsavedChanges = useCallback(
        (hasChanges: boolean, onSave?: () => Promise<void> | void, navigateTo: string = '/') => {
            if (!hasChanges) {
                router.push(navigateTo);
                return;
            }

            openFullscreenPopup(
                'Des modifications non enregistrées vont être perdues. Que souhaitez-vous faire ?',
                ['Enregistrer', 'Annuler', 'Quitter sans enregistrer'],
                async (index) => {
                    if (index === 0) {
                        // Save then navigate
                        if (onSave) {
                            await onSave();
                        }
                        router.push(navigateTo);
                    } else if (index === 2) {
                        // Leave without saving
                        router.push(navigateTo);
                    }
                    // index 1 = Cancel, do nothing
                }
            );
        },
        [openFullscreenPopup, router]
    );

    return { confirmUnsavedChanges };
}
