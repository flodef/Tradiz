'use server';

import nodemailer, { SendMailOptions } from 'nodemailer';
import { EMAIL, IS_DEV } from '../utils/constants';
import { Shop } from '../contexts/ConfigProvider';
import { Transaction } from '../hooks/useData';
import { SummaryData } from '../hooks/useSummary';

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
        const mailOptions: SendMailOptions = {
            ...email,
            to: IS_DEV ? 'flo@fims.fi' : email.to,
            from: `"Tradiz" <${process.env.SMTP_FROM_EMAIL}>`,
            bcc: process.env.SMTP_USER,
        };

        await transporter.sendMail(mailOptions);

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
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
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
 * @param transactions The transactions of the summary
 * @param message The message of the email
 * @returns A promise that resolves to a boolean indicating whether the email was sent successfully
 */
export async function sendSummaryEmail(summaryData: SummaryData): Promise<boolean> {
    const totalAmount = summaryData.transactions.reduce((total, transaction) => total + transaction.amount, 0);
    const transactionCount = summaryData.transactions.length;
    const productCount = summaryData.transactions.reduce(
        (total, transaction) => total + transaction.products.reduce((total, product) => total + product.quantity, 0),
        0
    );
    const averageTicket = transactionCount > 0 ? totalAmount / transactionCount : 0;

    const message = summaryData.summary
        .map((item) => (item.trim() ? item.replaceAll('\n', '     ') : '_'.repeat(50)))
        .join('\n');

    return await sendEmail({
        to: summaryData.shop.email,
        subject: `Ticket Z du ${summaryData.period}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <p>Bonjour,</p>
          <p>Ci-joint le Ticket Z du ${summaryData.period} d'un montant de ${summaryData.amount} :</p>
          <p>Nombre de ventes : ${transactionCount}</p>
          <p>Nombre de produits : ${productCount}</p>
          <p>Ticket moyen : ${averageTicket}</p>
          <table style="width: 55%; border-collapse: collapse; margin: 0; border: 1px solid #ccc;">
            ${message
                .split('\n')
                .map((line) =>
                    line.includes('_____')
                        ? `<tr style="width: 100%;"><td colspan="4" style="padding: 10px 0;"><hr style="border: none; height: 1px; background-color: #ccc; margin: 0;"/></td></tr>`
                        : line.includes('==>')
                          ? `
                            <tr style="width: 100%;">
                                ${line
                                    .split('==>')
                                    .map(
                                        (item, index) =>
                                            `<td colspan="2" style="width: 50%; padding: 5px; text-align: ${
                                                index === 0 ? 'left' : 'right'
                                            };">${item.trim()}</td>`
                                    )
                                    .join('')}
                            </tr>
                            `
                          : `<tr style="width: 100%;">
                          ${line
                              .split('  ')
                              .filter((item) => item.trim())
                              .map((item) => `<td style="width: 25%; text-align: center;">${item.trim()}</td>`)
                              .join('')}
                          </tr>`
                )
                .join('')}
          </table>
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
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <p>L'erreur suivante est survenue :</p>
          <p>${error}</p>
          <p>Merci,<br>L'équipe Tradiz</p>
        </div>
      `,
    });
}
