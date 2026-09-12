interface TradizLogoProps {
    size?: number;
    className?: string;
}

/**
 * Tradiz brand logo — a stylized "T" in a rounded orange gradient square.
 * Used in the landing page header and footer.
 */
export default function TradizLogo({ size = 36, className = '' }: TradizLogoProps) {
    return (
        <div
            className={`rounded-xl bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-sm ${className}`}
            style={{ width: size, height: size }}
        >
            <svg
                width={size * 0.55}
                height={size * 0.55}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Stylized "T" — thick top bar with a tapered stem */}
                <path
                    d="M3 4.5h18M12 4.5v15"
                    stroke="white"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    );
}
