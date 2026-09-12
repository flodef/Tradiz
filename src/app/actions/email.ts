'use server';

import nodemailer, { type SendMailOptions } from 'nodemailer';
import type { SummaryData } from '../hooks/useSummary';
import type { BillingReport } from '../utils/interfaces';
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
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
            console.error('SMTP not configured: missing SMTP_HOST, SMTP_USER, or SMTP_PASSWORD');
            return false;
        }

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
          <p>${escapeHtml(publicKey)} pour le rôle ${escapeHtml(role)}</p>
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
    try {
        const { totalAmount, transactionCount, productCount } = summaryData;
        const averageTicket = transactionCount > 0 ? totalAmount / transactionCount : 0;
        const averageTicketFormatted = `${averageTicket.toFixed(summaryData.currency.decimals)}${summaryData.currency.symbol}`;

        const message = summaryData.summary
            .map((item) => (item.trim() ? item.replaceAll('\n', '     ') : '_'.repeat(50)))
            .join('\n');

        return await sendEmail({
            to: summaryData.shop.email,
            subject: `Ticket Z du ${summaryData.period}`,
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
              <p>Bonjour,</p>
              <p>Ci-joint le Ticket Z du ${escapeHtml(summaryData.period)} d'un montant de ${escapeHtml(summaryData.amount)} :</p>
              <p>Nombre de ventes : ${transactionCount}</p>
              <p>Nombre de produits : ${productCount}</p>
              <p>Ticket moyen : ${averageTicketFormatted}</p>
              <table style="width: 55%; border-collapse: collapse; margin: 0; border: 1px solid #ccc;">
                ${message
                    .split('\n')
                    .map((line) =>
                        line.includes('_____')
                            ? `<tr style="width: 100%;"><td colspan="4" style="padding: 10px 0;"><hr style="border: none; height: 1px; background-color: #ccc; margin: 0;"/></td></tr>`
                            : line.includes('⟹')
                              ? `
                                <tr style="width: 100%;">
                                    ${line
                                        .split('⟹')
                                        .map(
                                            (item, index) =>
                                                `<td colspan="2" style="width: 50%; padding: 5px; text-align: ${
                                                    index === 0 ? 'left' : 'right'
                                                };">${escapeHtml(item.trim())}</td>`
                                        )
                                        .join('')}
                                </tr>
                                `
                              : line.includes('\t')
                                ? `<tr style="width: 100%;">
                                    ${line
                                        .split('\t')
                                        .map(
                                            (item) =>
                                                `<td style="width: 25%; text-align: center; padding: 5px;">${item.trim() ? escapeHtml(item.trim()) : '&nbsp;'}</td>`
                                        )
                                        .join('')}
                                  </tr>`
                                : `<tr style="width: 100%;">
                              ${line
                                  .split('  ')
                                  .map(
                                      (item) =>
                                          `<td style="width: 25%; text-align: center;">${escapeHtml(item.trim())}</td>`
                                  )
                                  .join('')}
                              </tr>`
                    )
                    .join('')}
              </table>
              <p>Merci,<br>L'équipe Tradiz</p>
            </div>
          `,
        });
    } catch (error) {
        console.error('Error in sendSummaryEmail:', error);
        return false;
    }
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
          <p>${escapeHtml(error)}</p>
          <p>Merci,<br>L'équipe Tradiz</p>
        </div>
      `,
    });
}

// Escape user-provided values before interpolating them into the email HTML.
function escapeHtml(value: string | number): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Dates arrive as 'YYYY-MM-DD'; parse as local time to avoid a UTC off-by-one day shift.
function formatReportDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR');
}

/**
 * Send a billing report by email
 */
export async function sendBillingReportEmail(report: BillingReport, to?: string): Promise<boolean> {
    const startLabel = formatReportDate(report.startDate);
    const endLabel = formatReportDate(report.endDate);
    const companyName = escapeHtml(report.companyName);

    const employerShare = Number(report.employerShare ?? 0).toFixed(2);
    const totalHT = Number(report.totalHT ?? 0).toFixed(2);
    const totalTVA = Number(report.totalTVA ?? 0).toFixed(2);
    const totalAmount = Number(report.totalAmount ?? 0).toFixed(2);

    const vatRows =
        report.vatBreakdown && report.vatBreakdown.length > 0
            ? report.vatBreakdown
                  .map(
                      (vat) => `
                <tr><td style="padding: 5px; border: 1px solid #ccc;">Total HT ${escapeHtml(vat.label)}</td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${Number(vat.ht).toFixed(2)} €</td></tr>
                <tr><td style="padding: 5px; border: 1px solid #ccc;">TVA ${escapeHtml(vat.label)}</td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${Number(vat.tva).toFixed(2)} €</td></tr>`
                  )
                  .join('')
            : `<tr><td style="padding: 5px; border: 1px solid #ccc;">Total HT</td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${totalHT} €</td></tr>
               <tr><td style="padding: 5px; border: 1px solid #ccc;">TVA</td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${totalTVA} €</td></tr>`;

    const rows =
        report.customers && report.customers.length > 0
            ? report.customers
                  .map(
                      (customer) => `
                <tr>
                    <td style="padding: 5px; border: 1px solid #ccc;">${escapeHtml(customer.reference || String(customer.customerId).padStart(6, '0'))}</td>
                    <td style="padding: 5px; border: 1px solid #ccc;">${escapeHtml(`${customer.lastName} ${customer.firstName}`)}</td>
                    <td style="padding: 5px; border: 1px solid #ccc; text-align: center;">${escapeHtml(customer.mealCount)}</td>
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
          <p>Voici la facture pour <strong>${companyName}</strong> du ${startLabel} au ${endLabel}.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #ccc;">
            <tr><td style="padding: 5px; border: 1px solid #ccc;">Prix / Quote part TTC</td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${employerShare} €</td></tr>
            <tr><td style="padding: 5px; border: 1px solid #ccc;">Nombre total de repas</td><td style="padding: 5px; border: 1px solid #ccc; text-align: right;">${report.mealCount}</td></tr>
            ${vatRows}
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
          <p>Clé publique de l'utilisateur : ${escapeHtml(publicKey)}</p>
          ${userEmail ? `<p>Email de l'utilisateur : ${escapeHtml(userEmail)}</p>` : ''}
          <p>Veuillez configurer les paramètres de l'application via la page d'administration.</p>
          <p>Une fois les paramètres configurés, l'utilisateur pourra accéder à l'application.</p>
          <p>Merci,<br>L'équipe Tradiz</p>
        </div>
      `,
    });
}

export async function sendContactEmail(
    shopEmail: string,
    fromName: string,
    fromEmail: string,
    subject: string,
    message: string,
    honeypot?: string
): Promise<boolean> {
    // Server-side honeypot check
    if (honeypot) return true;

    // Server-side input validation
    const name = String(fromName || '').trim();
    const email = String(fromEmail || '').trim();
    const subj = String(subject || '').trim();
    const msg = String(message || '').trim();

    if (!name || name.length > 100) return false;
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    if (!subj || subj.length > 200) return false;
    if (!msg || msg.length > 5000) return false;

    return await sendEmail({
        to: shopEmail,
        subject: `Contact site web - ${subj}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <p><strong>Nouveau message depuis le site web</strong></p>
          <p><strong>De :</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
          <p><strong>Sujet :</strong> ${escapeHtml(subj)}</p>
          <hr style="border: 1px solid #eee; margin: 16px 0;" />
          <p style="white-space: pre-wrap;">${escapeHtml(msg)}</p>
          <hr style="border: 1px solid #eee; margin: 16px 0;" />
          <p style="color: #999; font-size: 12px;">Ce message a été envoyé depuis le formulaire de contact du site web.</p>
        </div>
      `,
    });
}

export interface ReservationItem {
    label: string;
    category: string;
    price: number;
    quantity: number;
}

/**
 * Send a reservation email with the customer's product list and contact details.
 */
export async function sendReservationEmail(
    shopEmail: string,
    shopName: string,
    customerName: string,
    customerPhone: string,
    items: ReservationItem[],
    currencySymbol: string
): Promise<boolean> {
    const itemListHtml = items
        .map(
            (item) =>
                `<tr><td style="padding: 8px; border: 1px solid #ccc;">${escapeHtml(item.label)}</td><td style="padding: 8px; border: 1px solid #ccc; text-align: center;">${item.quantity}</td><td style="padding: 8px; border: 1px solid #ccc; text-align: right;">${(item.price * item.quantity).toFixed(2)} ${escapeHtml(currencySymbol)}</td></tr>`
        )
        .join('');

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const safeShopName = escapeHtml(shopName);

    return await sendEmail({
        to: shopEmail,
        subject: `Demande de réservation - ${shopName}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <p><strong>Nouvelle demande de réservation</strong></p>
          <p><strong>Client :</strong> ${escapeHtml(customerName)}</p>
          <p><strong>Téléphone :</strong> ${escapeHtml(customerPhone)}</p>
          <hr style="border: 1px solid #eee; margin: 16px 0;" />
          <p><strong>Produits réservés :</strong></p>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc;">
            <tr style="background-color: #f0f0f0;">
              <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Produit</th>
              <th style="padding: 8px; border: 1px solid #ccc; text-align: center;">Quantité</th>
              <th style="padding: 8px; border: 1px solid #ccc; text-align: right;">Total</th>
            </tr>
            ${itemListHtml}
            <tr style="background-color: #f0f0f0;">
              <td colspan="2" style="padding: 8px; border: 1px solid #ccc; text-align: right;"><strong>Total</strong></td>
              <td style="padding: 8px; border: 1px solid #ccc; text-align: right;"><strong>${total.toFixed(2)} ${escapeHtml(currencySymbol)}</strong></td>
            </tr>
          </table>
          <hr style="border: 1px solid #eee; margin: 16px 0;" />
          <p style="color: #999; font-size: 12px;">Cette demande a été envoyée depuis le site web depuis ${safeShopName}.</p>
        </div>
      `,
    });
}
