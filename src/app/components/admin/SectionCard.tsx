import { ReactNode } from 'react';

interface SectionCardProps {
    title: string;
    children: ReactNode;
    onSave?: () => void;
}

export default function SectionCard({ title, children, onSave }: SectionCardProps) {
    return (
        <div className="bg-white/30 dark:bg-black/20 shadow-lg rounded-lg p-6 mb-6 border border-black/10 dark:border-white/10 backdrop-blur">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-black/10 dark:border-white/10">
                <h2 className="text-2xl font-semibold text-light dark:text-dark">{title}</h2>
                {onSave && (
                    <button
                        onClick={onSave}
                        className="bg-active-light dark:bg-active-dark hover:opacity-80 text-popup-light dark:text-popup-dark font-bold py-2 px-5 rounded-md transition"
                    >
                        Enregistrer
                    </button>
                )}
            </div>
            <div className="space-y-4">{children}</div>
        </div>
    );
}
