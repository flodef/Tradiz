interface TradizLogoProps {
    size?: number;
    className?: string;
}

/**
 * Tradiz brand logo — used in the landing page header and footer.
 */
export default function TradizLogo({ size = 36, className = '' }: TradizLogoProps) {
    return (
        <img
            src="/logo.png"
            alt="Tradiz"
            width={size}
            height={size}
            className={`object-contain ${className}`}
            style={{ width: size, height: size }}
        />
    );
}
