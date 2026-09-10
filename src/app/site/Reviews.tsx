'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    IconStarFilled,
    IconStar,
    IconSend,
    IconExternalLink,
    IconBrandGoogle,
    IconUser,
    IconAlertCircle,
} from '@tabler/icons-react';
import { useReviewIdentity } from './useReviewIdentity';

/* ───────────────────────────── Types ───────────────────────────── */

interface PublicReview {
    id: number;
    userId: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
}

/* ───────────────────────────── Star Rating ───────────────────────────── */

function StarRating({
    value,
    onChange,
    size = 20,
    readOnly = false,
}: {
    value: number;
    onChange?: (rating: number) => void;
    size?: number;
    readOnly?: boolean;
}) {
    const [hover, setHover] = useState(0);

    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => {
                const filled = star <= (hover || value);
                return (
                    <button
                        key={star}
                        type="button"
                        disabled={readOnly}
                        onClick={() => !readOnly && onChange?.(star)}
                        onMouseEnter={() => !readOnly && setHover(star)}
                        onMouseLeave={() => !readOnly && setHover(0)}
                        className={`transition-transform ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
                    >
                        {filled ? (
                            <IconStarFilled size={size} className="text-amber-400" />
                        ) : (
                            <IconStar size={size} className="text-gray-300 dark:text-gray-600" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/* ───────────────────────────── Date formatting ───────────────────────────── */

function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

/* ───────────────────────────── Google Link ───────────────────────────── */

function GoogleReviewsLink({ googlePlaceId }: { googlePlaceId?: string }) {
    if (!googlePlaceId) return null;

    const googleMapsUrl = `https://www.google.com/maps/place/?q=place_id:${googlePlaceId}`;

    return (
        <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-site-border bg-site-surface text-site-text hover:border-amber-400 hover:text-amber-500 transition-colors text-sm font-medium"
        >
            <IconBrandGoogle size={18} className="text-amber-500" />
            Voir les avis sur Google
            <IconExternalLink size={14} />
        </a>
    );
}

/* ───────────────────────────── User Reviews Section ───────────────────────────── */

function UserReviewsSection({ shopId }: { shopId: string }) {
    const { identity, isLoaded, saveIdentity, updateName } = useReviewIdentity();
    const [reviews, setReviews] = useState<PublicReview[]>([]);
    const [averageRating, setAverageRating] = useState(0);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Form state
    const [nameInput, setNameInput] = useState('');
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');

    // Check if current user already has a review
    const userExistingReview = identity ? reviews.find((r) => r.userId === identity.userId) : null;

    const loadReviews = useCallback(() => {
        fetch(`/api/public/reviews/${shopId}`)
            .then((res) => res.json())
            .then((data) => {
                setReviews(data.reviews || []);
                setAverageRating(data.averageRating || 0);
            })
            .catch(() => {
                setReviews([]);
            })
            .finally(() => setLoading(false));
    }, [shopId]);

    useEffect(() => {
        loadReviews();
    }, [loadReviews]);

    // Pre-fill name from identity
    useEffect(() => {
        if (isLoaded && identity) {
            setNameInput(identity.userName);
        }
    }, [isLoaded, identity]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (!nameInput.trim()) {
            setError('Veuillez entrer votre nom.');
            return;
        }
        if (rating < 1 || rating > 5) {
            setError('Veuillez sélectionner une note de 1 à 5 étoiles.');
            return;
        }

        // Save/update identity if name changed or doesn't exist
        let currentIdentity = identity;
        if (!currentIdentity) {
            currentIdentity = saveIdentity(nameInput);
        } else if (currentIdentity.userName !== nameInput.trim()) {
            updateName(nameInput);
        }

        setSubmitting(true);
        try {
            const res = await fetch(`/api/public/reviews/${shopId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentIdentity.userId,
                    userName: nameInput.trim(),
                    rating,
                    comment: comment.trim(),
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Erreur lors de l'envoi de l'avis.");
            }

            setSuccess(true);
            setComment('');
            setRating(0);
            loadReviews();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-3 text-site-text-secondary">
                <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>Chargement des avis…</span>
            </div>
        );
    }

    return (
        <div className="bg-site-surface border border-site-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Avis des clients</h3>
                {reviews.length > 0 && (
                    <div className="flex items-center gap-2">
                        <StarRating value={Math.round(averageRating)} readOnly size={16} />
                        <span className="text-sm font-semibold">{averageRating.toFixed(1)}</span>
                        <span className="text-sm text-site-text-secondary">({reviews.length} avis)</span>
                    </div>
                )}
            </div>

            {/* Review form */}
            <form onSubmit={handleSubmit} className="mb-6 space-y-3">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-site-text-secondary">Votre nom</label>
                    <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder="Entrez votre nom"
                        maxLength={100}
                        className="px-3 py-2 rounded-lg border border-site-border bg-site-bg text-site-text focus:ring-2 focus:ring-amber-400 focus:border-amber-400 focus:outline-none transition-colors"
                        disabled={submitting}
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-site-text-secondary">Votre note</label>
                    <StarRating value={rating} onChange={setRating} size={28} />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-site-text-secondary">
                        Votre commentaire (optionnel)
                    </label>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Partagez votre expérience…"
                        maxLength={2000}
                        rows={3}
                        className="px-3 py-2 rounded-lg border border-site-border bg-site-bg text-site-text focus:ring-2 focus:ring-amber-400 focus:border-amber-400 focus:outline-none transition-colors resize-none"
                        disabled={submitting}
                    />
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-sm text-red-500">
                        <IconAlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}
                {success && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <span>Merci ! Votre avis a été publié.</span>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={submitting || rating === 0 || !nameInput.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {submitting ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Envoi…
                        </>
                    ) : (
                        <>
                            <IconSend size={16} />
                            {userExistingReview ? 'Modifier mon avis' : 'Publier mon avis'}
                        </>
                    )}
                </button>
                {userExistingReview && !submitting && (
                    <p className="text-xs text-site-text-secondary">
                        Vous avez déjà publié un avis. Un nouvel envoi le remplacera.
                    </p>
                )}
            </form>

            {/* Reviews list */}
            {reviews.length === 0 ? (
                <p className="text-site-text-secondary text-sm">Soyez le premier à laisser un avis !</p>
            ) : (
                <div className="space-y-4">
                    {reviews.map((review) => (
                        <div key={review.id} className="border-l-2 border-amber-200 dark:border-amber-800 pl-4">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                    <IconUser size={16} className="text-amber-600 dark:text-amber-400" />
                                </div>
                                <span className="font-medium text-sm">{review.userName}</span>
                                <StarRating value={review.rating} readOnly size={12} />
                            </div>
                            {review.comment && (
                                <p className="text-sm text-site-text-secondary mt-1">{review.comment}</p>
                            )}
                            <p className="text-xs text-site-text-secondary/60 mt-1">{formatDate(review.createdAt)}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ───────────────────────────── Main Component ───────────────────────────── */

export default function Reviews({ shopId, googlePlaceId }: { shopId: string; googlePlaceId?: string }) {
    return (
        <section className="max-w-6xl mx-auto px-4 md:px-6 pb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">Avis & Notes</h2>
            <div className="flex flex-col items-center gap-6">
                <UserReviewsSection shopId={shopId} />
                <GoogleReviewsLink googlePlaceId={googlePlaceId} />
            </div>
        </section>
    );
}
