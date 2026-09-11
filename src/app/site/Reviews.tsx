'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
    IconStarFilled,
    IconStar,
    IconStarHalfFilled,
    IconSend,
    IconExternalLink,
    IconBrandGoogle,
    IconAlertCircle,
    IconX,
} from '@tabler/icons-react';
import { useReviewIdentity } from './useReviewIdentity';

/* ───────────────────────────── Constants ───────────────────────────── */

const NAME_MIN = 3;
const NAME_MAX = 30;
const COMMENT_MIN = 10;
const COMMENT_MAX = 1000;
// Show only the first N characters of a comment before collapsing
const COMMENT_PREVIEW = 180;

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

    // Determine which icon to show for a given star position (1..5)
    // given the current display value (hover or actual).
    const displayValue = hover || value;

    const handleClick = (star: number, half: boolean) => {
        if (readOnly) return;
        onChange?.(star - (half ? 0.5 : 0));
    };

    return (
        <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Note">
            {[1, 2, 3, 4, 5].map((star) => {
                const filled = star <= Math.floor(displayValue);
                const halfFilled = !filled && star - 0.5 <= displayValue;
                return (
                    <div key={star} className="relative inline-flex">
                        {/* Left half (0.5) */}
                        {!readOnly && (
                            <button
                                type="button"
                                aria-label={`${star - 0.5} étoile${star - 0.5 > 1 ? 's' : ''}`}
                                className="absolute left-0 top-0 h-full w-1/2 cursor-pointer z-10"
                                onClick={() => handleClick(star, true)}
                                onMouseEnter={() => setHover(star - 0.5)}
                                onMouseLeave={() => setHover(0)}
                            />
                        )}
                        {/* Right half (full) */}
                        {!readOnly && (
                            <button
                                type="button"
                                aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
                                className="absolute right-0 top-0 h-full w-1/2 cursor-pointer z-10"
                                onClick={() => handleClick(star, false)}
                                onMouseEnter={() => setHover(star)}
                                onMouseLeave={() => setHover(0)}
                            />
                        )}
                        {filled ? (
                            <IconStarFilled size={size} className="text-amber-400" />
                        ) : halfFilled ? (
                            <IconStarHalfFilled size={size} className="text-amber-400" />
                        ) : (
                            <IconStar size={size} className="text-gray-300 dark:text-gray-600" />
                        )}
                    </div>
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

/* ───────────────────────────── Auto-growing textarea ───────────────────────────── */

function AutoTextarea({
    value,
    onChange,
    placeholder,
    maxLength,
    disabled,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    maxLength?: number;
    disabled?: boolean;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);

    const resize = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, []);

    useEffect(() => {
        resize();
    }, [value, resize]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
            rows={1}
            className="px-3 py-2 rounded-lg border border-site-border bg-site-bg text-site-text focus:ring-2 focus:ring-amber-400 focus:border-amber-400 focus:outline-none transition-colors resize-none overflow-hidden min-h-11"
        />
    );
}

/* ───────────────────────────── Collapsible comment ───────────────────────────── */

function ReviewComment({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false);
    const isLong = text.length > COMMENT_PREVIEW;

    if (!isLong) {
        return <p className="text-sm text-site-text-secondary mt-1">{text}</p>;
    }

    return (
        <div className="mt-1">
            <p className="text-sm text-site-text-secondary">
                {expanded ? text : `${text.slice(0, COMMENT_PREVIEW).trimEnd()}…`}
            </p>
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 cursor-pointer mt-1"
            >
                {expanded ? 'Voir moins' : 'Voir plus'}
            </button>
        </div>
    );
}

/* ───────────────────────────── User Reviews Section ───────────────────────────── */

function UserReviewsSection({
    shopId,
    onAverageChange,
}: {
    shopId: string;
    onAverageChange: (avg: number, count: number) => void;
}) {
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
                onAverageChange(data.averageRating || 0, data.reviews?.length || 0);
            })
            .catch(() => {
                setReviews([]);
                onAverageChange(0, 0);
            })
            .finally(() => setLoading(false));
    }, [shopId, onAverageChange]);

    useEffect(() => {
        loadReviews();
    }, [loadReviews]);

    // Pre-fill name from identity
    useEffect(() => {
        if (isLoaded && identity) {
            setNameInput(identity.userName);
        }
    }, [isLoaded, identity]);

    const validate = (): string | null => {
        const name = nameInput.trim();
        if (name.length < NAME_MIN) {
            return `Le nom doit contenir au moins ${NAME_MIN} caractères.`;
        }
        if (name.length > NAME_MAX) {
            return `Le nom ne peut pas dépasser ${NAME_MAX} caractères.`;
        }
        if (rating < 0.5 || rating > 5) {
            return 'Veuillez sélectionner une note.';
        }
        const c = comment.trim();
        if (c.length < COMMENT_MIN) {
            return `Le commentaire doit contenir au moins ${COMMENT_MIN} caractères.`;
        }
        if (c.length > COMMENT_MAX) {
            return `Le commentaire ne peut pas dépasser ${COMMENT_MAX} caractères.`;
        }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        const validationError = validate();
        if (validationError) {
            setError(validationError);
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
        <div className="space-y-6">
            {/* Review form */}
            <form onSubmit={handleSubmit} className="space-y-3">
                {/* Name + rating on same line */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-sm font-medium text-site-text-secondary">Votre nom</label>
                        <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="Entrez votre nom"
                            minLength={NAME_MIN}
                            maxLength={NAME_MAX}
                            className="px-3 py-2 rounded-lg border border-site-border bg-site-bg text-site-text focus:ring-2 focus:ring-amber-400 focus:border-amber-400 focus:outline-none transition-colors"
                            disabled={submitting}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-site-text-secondary">Votre note</label>
                        <div className="flex items-center h-11">
                            <StarRating value={rating} onChange={setRating} size={28} />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-site-text-secondary">Votre commentaire</label>
                    <AutoTextarea
                        value={comment}
                        onChange={setComment}
                        placeholder="Partagez votre expérience…"
                        maxLength={COMMENT_MAX}
                        disabled={submitting}
                    />
                    <span className="text-xs text-site-text-secondary text-right">
                        {comment.trim().length}/{COMMENT_MAX}
                    </span>
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
                    disabled={submitting}
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
                                <span className="font-medium text-sm">{review.userName}</span>
                                <StarRating value={review.rating} readOnly size={12} />
                            </div>
                            {review.comment && <ReviewComment text={review.comment} />}
                            <p className="text-xs text-site-text-secondary/60 mt-1">{formatDate(review.createdAt)}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ───────────────────────────── Main Component (Modal) ───────────────────────────── */

export default function Reviews({
    shopId,
    googlePlaceId,
    open,
    onClose,
}: {
    shopId: string;
    googlePlaceId?: string;
    open: boolean;
    onClose: () => void;
}) {
    const [average, setAverage] = useState(0);
    const [count, setCount] = useState(0);

    const handleAverageChange = useCallback((avg: number, c: number) => {
        setAverage(avg);
        setCount(c);
    }, []);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-site-overlay p-4" onClick={onClose}>
            <div
                className="bg-site-surface rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-site-text">Avis & Notes</h3>
                        {count > 0 && (
                            <div className="flex items-center gap-2">
                                <StarRating value={Math.round(average * 2) / 2} readOnly size={16} />
                                <span className="text-sm font-semibold">{average.toFixed(1)}</span>
                                <span className="text-sm text-site-text-secondary">({count})</span>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="text-site-text-muted hover:text-site-text cursor-pointer">
                        <IconX size={24} />
                    </button>
                </div>

                <div className="flex flex-col gap-6">
                    <UserReviewsSection shopId={shopId} onAverageChange={handleAverageChange} />
                    <div className="flex justify-center">
                        <GoogleReviewsLink googlePlaceId={googlePlaceId} />
                    </div>
                </div>
            </div>
        </div>
    );
}
