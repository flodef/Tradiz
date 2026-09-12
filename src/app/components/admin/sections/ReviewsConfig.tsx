'use client';

import { useEffect, useState } from 'react';
import { IconStar, IconTrash, IconStarFilled, IconStarHalfFilled } from '@tabler/icons-react';
import SectionCard from '../SectionCard';
import { usePopup } from '@/app/hooks/usePopup';

interface Review {
    id: number;
    userId: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
}

interface ReviewsConfigProps {
    isReadOnly?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}

function StarRating({ rating }: { rating: number }) {
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

    return (
        <div className="flex items-center gap-0.5">
            {Array.from({ length: fullStars }).map((_, i) => (
                <IconStarFilled key={`full-${i}`} size={16} className="text-amber-400" />
            ))}
            {hasHalf && <IconStarHalfFilled size={16} className="text-amber-400" />}
            {Array.from({ length: emptyStars }).map((_, i) => (
                <IconStar key={`empty-${i}`} size={16} className="text-gray-300 dark:text-gray-600" />
            ))}
        </div>
    );
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

export default function ReviewsConfig({ isReadOnly = false, isOpen, onToggle, icon }: ReviewsConfigProps) {
    const { openPopup } = usePopup();
    const [reviews, setReviews] = useState<Review[]>([]);
    const [averageRating, setAverageRating] = useState(0);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchReviews = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/sql/getReviews');
            if (!res.ok) throw new Error('Server error');
            const data = await res.json();
            setReviews(data.reviews || []);
            setAverageRating(data.averageRating || 0);
        } catch {
            setReviews([]);
            setAverageRating(0);
            setError('Impossible de charger les avis.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReviews();
    }, []);

    const handleDelete = (review: Review) => {
        openPopup('Supprimer cet avis ?', ['Supprimer', 'Annuler'], (index: number) => {
            if (index !== 0) return;
            setDeletingId(review.id);
            fetch('/api/sql/deleteReview', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: review.id }),
            })
                .then((res) => {
                    if (res.ok) {
                        setReviews((prev) => prev.filter((r) => r.id !== review.id));
                    } else {
                        openPopup('Erreur', ['Impossible de supprimer cet avis.'], () => {});
                    }
                })
                .catch(() => {
                    openPopup('Erreur', ['Impossible de supprimer cet avis.'], () => {});
                })
                .finally(() => setDeletingId(null));
        });
    };

    return (
        <SectionCard
            title="Avis clients"
            icon={icon ?? <IconStar size={24} />}
            isOpen={isOpen}
            onToggle={onToggle}
            isReadOnly={isReadOnly}
            isLoading={loading}
            hasChanges={false}
            isValid
            onAdd={undefined}
            addLabel=""
        >
            {loading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Chargement des avis…</p>
            ) : error ? (
                <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            ) : reviews.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Aucun avis pour le moment.</p>
            ) : (
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center gap-1">
                            <span className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                                {averageRating.toFixed(1)}
                            </span>
                            <IconStarFilled size={20} className="text-amber-400" />
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{reviews.length} avis au total</span>
                    </div>
                    <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin pr-1">
                        {reviews.map((review) => (
                            <div
                                key={review.id}
                                className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                                                {review.userName}
                                            </span>
                                            <StarRating rating={review.rating} />
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 wrap-break-word">
                                            {review.comment || 'Aucun commentaire'}
                                        </p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                            {formatDate(review.createdAt)}
                                        </p>
                                    </div>
                                    {!isReadOnly && (
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(review)}
                                            disabled={deletingId === review.id}
                                            title="Supprimer cet avis"
                                            className="shrink-0 p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                        >
                                            <IconTrash size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </SectionCard>
    );
}
