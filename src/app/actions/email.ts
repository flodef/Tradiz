'use server';

import nodemailer, { SendMailOptions } from 'nodemailer';
import { SummaryData } from '../hooks/useSummary';
import { BillingReport } from '../utils/interfaces';
import { DEV_EMAIL, IS_DEV } from '../utils/constants';

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
            to: IS_DEV ? DEV_EMAIL : email.to,
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
        to: DEV_EMAIL,
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

/**
 * Send a billing report by email
 */
export async function sendBillingReportEmail(report: BillingReport, to?: string): Promise<boolean> {
    const vatRatePercent = (report.vatRate * 100).toFixed(0);
    const startLabel = new Date(report.startDate).toLocaleDateString('fr-FR');
    const endLabel = new Date(report.endDate).toLocaleDateString('fr-FR');

    const mealPrice = Number(report.mealPrice ?? 0).toFixed(2);
    const totalHT = Number(report.totalHT ?? 0).toFixed(2);
    const totalTVA = Number(report.totalTVA ?? 0).toFixed(2);
    const totalAmount = Number(report.totalAmount ?? 0).toFixed(2);

    const rows =
        report.customers && report.customers.length > 0
            ? report.customers
                  .map(
                      (customer) => `
                <tr>
                    <td style="padding: 5px; border: 1px solid #ccc;">${customer.reference || String(customer.customerId).padStart(6, '0')}</td>
                    <td style="padding: 5px; border: 1px solid #ccc;">${customer.lastName} ${customer.firstName}</td>
                    <td style="padding: 5px; border: 1px solid #ccc; text-align: center;">${customer.mealCount}</td>
                    <td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${Number(customer.totalAmount ?? 0).toFixed(2)} €</td>
                </tr>`
                  )
                  .join('')
            : '<tr><td colspan="4" style="padding: 5px; text-align: center;">Aucun repas</td></tr>';

    return await sendEmail({
        to: to || process.env.SMTP_USER || DEV_EMAIL,
        subject: `Facture ${report.companyName} - ${startLabel} au ${endLabel}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <p>Bonjour,</p>
          <p>Voici la facture pour <strong>${report.companyName}</strong> du ${startLabel} au ${endLabel}.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #ccc;">
            <tr><td style="padding: 5px; border: 1px solid #ccc;">Prix / Quote part TTC</td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${mealPrice} €</td></tr>
            <tr><td style="padding: 5px; border: 1px solid #ccc;">Nombre total de repas</td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${report.mealCount}</td></tr>
            <tr><td style="padding: 5px; border: 1px solid #ccc;">Total HT ${vatRatePercent}%</td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${totalHT} €</td></tr>
            <tr><td style="padding: 5px; border: 1px solid #ccc;">TVA ${vatRatePercent}%</td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${totalTVA} €</td></tr>
            <tr><td style="padding: 5px; border: 1px solid #ccc;"><strong>Total TTC à facturer</strong></td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;"><strong>${totalAmount} €</strong></td></tr>
          </table>
          <p>Détail par personne :</p>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc;">
            <tr style="background-color: #f0f0f0;">
              <th style="padding: 5px; border: 1px solid #ccc; text-align: left;">N° Cpt</th>
              <th style="padding: 5px; border: 1px solid #ccc; text-align: left;">Désignation</th>
              <th style="padding: 5px; border: 1px solid #ccc;">Qté</th>
              <th style="padding: 5px; border: 1px solid #ccc; text-align: right;">CA</th>
            </tr>
            ${rows}
          </table>
          <p>Merci,<br>L'équipe Tradiz</p>
        </div>
      `,
    });
}

/**
 * Send an email to request access when parameters are missing
 * @param publicKey The public key of the user
 * @param userEmail The email of the user (if available)
 * @returns A promise that resolves to a boolean indicating whether the email was sent successfully
 */
export async function sendMissingParametersRequest(publicKey: string, userEmail?: string): Promise<boolean> {
    const adminEmail = DEV_EMAIL || process.env.SMTP_USER;
    return await sendEmail({
        to: adminEmail,
        subject: "Demande d'accès - Paramètres manquants",
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <p>Bonjour,</p>
          <p>Un utilisateur tente d'accéder à l'application mais les paramètres ne sont pas configurés.</p>
          <p>Clé publique de l'utilisateur : ${publicKey}</p>
          ${userEmail ? `<p>Email de l'utilisateur : ${userEmail}</p>` : ''}
          <p>Veuillez configurer les paramètres de l'application via la page d'administration.</p>
          <p>Une fois les paramètres configurés, l'utilisateur pourra accéder à l'application.</p>
          <p>Merci,<br>L'équipe Tradiz</p>
        </div>
      `,
    });
}
