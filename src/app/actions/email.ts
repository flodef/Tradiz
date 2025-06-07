'use server';

import nodemailer, { SendMailOptions } from 'nodemailer';
import { EMAIL } from '../utils/constants';

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

async function sendEmail(email: SendMailOptions): Promise<boolean> {
    try {
        await transporter.sendMail({
            ...email,
            from: `"Tradiz" <${process.env.SMTP_FROM_EMAIL}>`,
            bcc: 'contact@tradiz.fr',
        });

        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

/**
 * Send an email to a user to grant access to the application
 * @param email The email of the user
 * @param role The role of the user
 * @param publicKey The public key of the user
 * @returns A promise that resolves to a boolean indicating whether the email was sent successfully
 */
export async function sendUserAccessRequest(email: string, role: string, publicKey: string): Promise<boolean> {
    return await sendEmail({
        to: email,
        subject: "Demande d'accès utilisateur",
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Demande d'accès utilisateur</h2>
          <p>Bonjour,</p>
          <p>Nous avons reçu une demande d'accès utilisateur pour votre application.</p>
          <p>Pour autoriser l'accès, veuillez ajouter la clé suivante :</p>
          <p>${publicKey}</p> pour le rôle ${role}</p>
          <p>Si vous ou un de vos collaborateurs n'avez pas effectué cette demande, vous pouvez ignorer cet email.</p>
          <p>Merci,<br>L'équipe Tradiz</p>
        </div>
      `,
    });
}

/**
 * Send an email to the admin to notify a summary
 * @param email The email of the admin
 * @param period The period of the summary
 * @param amount The amount of the summary
 * @param message The message of the email
 * @returns A promise that resolves to a boolean indicating whether the email was sent successfully
 */
export async function sendSummaryEmail(
    email: string,
    period: string,
    amount: string,
    message: string
): Promise<boolean> {
    return await sendEmail({
        to: email,
        subject: `Ticket Z du ${period}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Ticket Z du ${period}</h2>
          <p>Bonjour,</p>
          <p>Ci-joint le Ticket Z du ${period} d'un montant de ${amount} :</p>
          <p>${message}</p>
          <p>Merci,<br>L'équipe Tradiz</p>
        </div>
      `,
    });
}

/**
 * Send an email to the admin to notify a fatal error
 * @param error The error message
 * @returns A promise that resolves to a boolean indicating whether the email was sent successfully
 */
export async function sendFatalErrorEmail(error: string): Promise<boolean> {
    return await sendEmail({
        to: EMAIL,
        subject: 'Erreur fatale',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Erreur fatale</h2>
          <p>L'erreur suivante est survenue :</p>
          <p>${error}</p>
          <p>Merci,<br>L'équipe Tradiz</p>
        </div>
      `,
    });
}
