import type {
    CornerDotType,
    CornerSquareType,
    DotType,
    DrawType,
    ErrorCorrectionLevel,
    Gradient,
    Mode,
    Options,
    TypeNumber,
} from '@solana/qr-code-styling';
import QRCodeStyling from '@solana/qr-code-styling';

/**
 * Create a QR code from a Solana Pay URL.
 *
 * @param url - The URL to encode.
 * @param size - Width and height in pixels.
 * @param background - Background color, which should be light for device compatibility.
 * @param color - Foreground color, which should be dark for device compatibility.
 * @param gradient - Optional gradient to apply to the foreground color.
 */
export function createQR(
    url: string | URL,
    size = 512,
    background = 'white',
    color = 'black',
    gradient?: Gradient
): QRCodeStyling {
    return new QRCodeStyling(createQROptions(url, size, background, color, gradient));
}

/** @ignore */
export function createQROptions(
    url: string | URL,
    size = 512,
    background = 'white',
    color = 'black',
    gradient?: Gradient
): Options {
    return {
        type: 'svg' as DrawType,
        width: size,
        height: size,
        data: String(url),
        margin: 16,
        qrOptions: {
            typeNumber: 0 as TypeNumber,
            mode: 'Byte' as Mode,
            errorCorrectionLevel: 'Q' as ErrorCorrectionLevel,
        },
        backgroundOptions: { color: background },
        dotsOptions: { type: 'extra-rounded' as DotType, gradient, color },
        cornersSquareOptions: {
            type: 'extra-rounded' as CornerSquareType,
            gradient,
            color,
        },
        // height="16" viewBox="0 0 16 14" width="16" xmlns="http://www.w3.org/2000/svg">
        cornersDotOptions: { type: 'square' as CornerDotType, gradient, color },
        imageOptions: { hideBackgroundDots: true, imageSize: 0.15, margin: 8 },
        image:
            `data:image/svg+xml;utf8,<svg fill="${encodeURIComponent(color)}" ` +
            `height="22" width="60" viewBox="320 335 150 40" xmlns="http://www.w3.org/2000/svg">
            <path class="st0" d="M364.84,344.81c0-5.05-4.09-9.14-9.15-9.14h-24.55c-5.05,0-9.14,4.09-9.14,9.14v9.14h9.14h13.34h11.21
                C360.75,353.95,364.84,349.86,364.84,344.81L364.84,344.81z"/>
            <path class="st1" d="M364.84,365.01c0-5.05-4.09-9.14-9.15-9.14h-3.54c-5.05,0-9.15,4.09-9.15,9.14v9.14h9.15h3.54
                C360.75,374.15,364.84,370.06,364.84,365.01L364.84,365.01z"/>
            <path class="st2" d="M340.29,365.01c0-5.05-4.09-9.14-9.15-9.14c-5.05,0-9.14,4.09-9.14,9.14c0,5.05,4.09,9.14,9.14,9.14
                C336.19,374.15,340.29,370.06,340.29,365.01L340.29,365.01z"/>
            <path class="st0" d="M416.47,359.33l5.6-15.6l5.7,15.6l2.06,5.75l1.8,4.74c0.24,0.58,0.53,1.26,0.86,2.02
                c0.33,0.77,0.65,1.33,0.94,1.7c0.29,0.37,0.65,0.66,1.08,0.88c0.43,0.21,0.95,0.32,1.55,0.32c1.03,0,1.91-0.36,2.64-1.1
                c0.73-0.73,1.1-1.53,1.1-2.41c0-0.84-0.39-2.19-1.16-4.05l-9.88-24.39c-0.46-1.22-0.85-2.2-1.15-2.93
                c-0.3-0.73-0.67-1.41-1.11-2.05c-0.44-0.64-1.01-1.16-1.73-1.56c-0.71-0.4-1.6-0.61-2.67-0.61c-1.05,0-1.93,0.2-2.64,0.61
                c-0.71,0.4-1.29,0.93-1.73,1.59c-0.44,0.65-0.85,1.47-1.24,2.46c-0.39,0.99-0.72,1.84-0.99,2.54l-9.67,24.55
                c-0.4,0.98-0.68,1.74-0.85,2.29c-0.17,0.55-0.26,1.08-0.26,1.6c0,0.89,0.37,1.69,1.11,2.4c0.74,0.7,1.59,1.06,2.55,1.06
                c1.14,0,1.95-0.33,2.45-0.99c0.5-0.66,1.1-1.94,1.81-3.83l1.8-4.85 M451.59,365.81c0.7,0.76,1.62,1.15,2.76,1.15
                c1.12,0,2.04-0.39,2.76-1.16s1.08-1.94,1.08-3.51v-4.19l9.46-14.52c0.79-1.19,1.35-2.11,1.68-2.78c0.33-0.67,0.49-1.34,0.49-2.01
                c0-0.83-0.32-1.55-0.97-2.18c-0.64-0.63-1.45-0.94-2.41-0.94c-0.62,0-1.14,0.11-1.57,0.34c-0.43,0.22-0.82,0.55-1.17,0.97
                c-0.35,0.42-0.68,0.87-0.97,1.35c-0.29,0.48-0.65,1.07-1.08,1.78l-7.14,11.47l-7.06-11.47c-1.08-1.77-1.9-2.95-2.44-3.55
                c-0.54-0.59-1.34-0.89-2.39-0.89c-1,0-1.83,0.32-2.51,0.95c-0.68,0.64-1.02,1.39-1.02,2.27c0,0.53,0.17,1.16,0.5,1.88
                c0.34,0.72,0.91,1.73,1.72,3.02l9.23,14.31v4.19C450.53,363.87,450.88,365.04,451.59,365.81L451.59,365.81z"/>
            <path class="st0" d="M401.19,356.17c2.37-2.01,3.55-4.97,3.55-8.87c0-1.83-0.29-3.47-0.87-4.94c-0.58-1.46-1.44-2.7-2.56-3.71
                c-1.12-1.01-2.46-1.73-4-2.17c-1.56-0.45-3.79-0.68-6.68-0.68h-9.79c-1.68,0-2.9,0.37-3.68,1.1c-0.77,0.73-1.16,1.95-1.16,3.66
                v22.42c0,1.53,0.35,2.69,1.05,3.49c0.7,0.79,1.63,1.19,2.78,1.19c1.1,0,2.01-0.4,2.73-1.2c0.72-0.8,1.08-1.98,1.08-3.53v-3.75h6.99
                C395.31,359.18,398.83,358.18,401.19,356.17L401.19,356.17z M395.54,343.33c0.98,1.06,1.46,2.44,1.46,4.13
                c0,1.41-0.32,2.55-0.95,3.42c-0.63,0.87-1.56,1.5-2.76,1.88c-1.21,0.38-2.71,0.57-4.51,0.57h-5.14v-11.7h5.14
                C392.19,341.64,394.44,342.2,395.54,343.33L395.54,343.33L395.54,343.33z"/>
            <path class="st1" d="M421.72,366.19c-2.23,0-4.04-1.84-4.04-4.1v0.08c0-2.27,1.81-4.1,4.04-4.1h4.04v4.1v-0.08
                C425.76,364.35,423.95,366.19,421.72,366.19L421.72,366.19z"/>
            <path class="st0" d="M379.83,346.01c-2.11,0-3.83,1.73-3.83,3.87v21.01c0,2.14,1.71,3.87,3.83,3.87h3.83v-3.87v-4.74v-16.27
                C383.65,347.74,381.94,346.01,379.83,346.01L379.83,346.01z"/>
            <path class="st0" d="M454.37,355.93c-2.11,0-3.83,1.73-3.83,3.87v11.09c0,2.14,1.71,3.87,3.83,3.87h3.83v-3.87v-4.74v-6.35
                C458.19,357.66,456.48,355.93,454.37,355.93L454.37,355.93z"/>
        </svg>`,
    };
}
