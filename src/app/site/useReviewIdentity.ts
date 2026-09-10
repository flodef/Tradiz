'use client';

import { useCallback, useEffect, useState } from 'react';

const REVIEW_IDENTITY_KEY = 'tradiz_review_identity';

export interface ReviewIdentity {
    userId: string;
    userName: string;
}

/** Generate a random user ID */
function generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Manages a review identity stored in localStorage.
 * The identity is auto-generated on first use and persisted across sessions.
 * A user can only post one review per shop (enforced server-side via unique constraint).
 */
export function useReviewIdentity() {
    const [identity, setIdentity] = useState<ReviewIdentity | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load identity from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(REVIEW_IDENTITY_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as ReviewIdentity;
                if (parsed.userId && parsed.userName) {
                    setIdentity(parsed);
                }
            }
        } catch {
            // Ignore parse errors
        }
        setIsLoaded(true);
    }, []);

    const saveIdentity = useCallback((name: string) => {
        const newIdentity: ReviewIdentity = {
            userId: generateUserId(),
            userName: name.trim(),
        };
        try {
            localStorage.setItem(REVIEW_IDENTITY_KEY, JSON.stringify(newIdentity));
        } catch {
            // Ignore storage errors
        }
        setIdentity(newIdentity);
        return newIdentity;
    }, []);

    const updateName = useCallback(
        (name: string) => {
            if (!identity) return;
            const updated = { ...identity, userName: name.trim() };
            try {
                localStorage.setItem(REVIEW_IDENTITY_KEY, JSON.stringify(updated));
            } catch {
                // Ignore storage errors
            }
            setIdentity(updated);
        },
        [identity]
    );

    return { identity, isLoaded, saveIdentity, updateName };
}
