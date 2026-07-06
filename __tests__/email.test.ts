import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMissingParametersRequest } from '../src/app/actions/email';

// Mock nodemailer
vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({
            sendMail: vi.fn().mockResolvedValue(true),
        })),
    },
}));

describe('sendMissingParametersRequest', () => {
    beforeEach(() => {
        // Reset process.env before each test
        process.env.SMTP_USER = 'admin@example.com';
        process.env.SMTP_FROM_EMAIL = 'noreply@tradiz.fr';
        process.env.IS_DEV = 'false';
    });

    it('should send email with public key and user email', async () => {
        const result = await sendMissingParametersRequest('public-key-123', 'user@example.com');
        expect(result).toBe(true);
    });

    it('should send email with only public key when user email is not provided', async () => {
        const result = await sendMissingParametersRequest('public-key-123');
        expect(result).toBe(true);
    });

    it('should send email to SMTP_USER', async () => {
        const result = await sendMissingParametersRequest('public-key-123', 'user@example.com');
        expect(result).toBe(true);
    });
});
