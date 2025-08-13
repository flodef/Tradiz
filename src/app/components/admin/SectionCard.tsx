import { ReactNode } from 'react';

interface SectionCardProps {
    title: string;
    children: ReactNode;
    onSave: () => void;
}

export default function SectionCard({ title, children, onSave }: SectionCardProps) {
    return (
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
                <button
                    onClick={onSave}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                    Enregistrer
                </button>
            </div>
            <div className="space-y-4">{children}</div>
        </div>
    );
}