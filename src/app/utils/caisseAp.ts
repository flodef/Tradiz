/**
 * Caisse-AP over IP protocol implementation.
 *
 * This is a vendor-independent protocol used in France to communicate between
 * a point of sale (caisse) and a payment terminal (TPE). It exchanges simple
 * text data encoded as ASCII over a raw TCP socket.
 *
 * Message format: Tag-Length-Value (TLV)
 *   - Tag:   2 ASCII characters
 *   - Length: 3 ASCII digits (zero-padded), representing the byte length of the value
 *   - Value:  ASCII string of the specified length
 *
 * The first tag must always be CZ (protocol version).
 * The order of other tags is not significant.
 *
 * Reference: https://github.com/akretion/caisse-ap-ip
 */

export interface CaisseApMessage {
    [tag: string]: string;
}

/** Encode a Caisse-AP message dict into the ASCII TLV wire format. */
export function encodeCaisseApMessage(msg: CaisseApMessage): string {
    const entries: [string, string][] = [];

    // CZ must always be first
    if ('CZ' in msg) {
        entries.push(['CZ', msg['CZ']]);
    }
    for (const [tag, value] of Object.entries(msg)) {
        if (tag === 'CZ') continue;
        entries.push([tag, value]);
    }

    return entries
        .map(([tag, value]) => {
            if (tag.length !== 2) throw new Error(`Invalid tag length: ${tag} (must be 2 chars)`);
            if (value.length < 1 || value.length > 999)
                throw new Error(`Invalid value length for tag ${tag}: ${value.length} (must be 1-999)`);
            // The spec defines the length field as a byte count. The protocol
            // is ASCII-only, so for valid values byte length === char length.
            // Guard against non-ASCII values that would make the two diverge
            // and corrupt the TLV frame.
            for (let j = 0; j < value.length; j++) {
                if (value.charCodeAt(j) > 127) {
                    throw new Error(`Non-ASCII value for tag ${tag}: Caisse-AP requires ASCII`);
                }
            }
            return `${tag}${String(value.length).padStart(3, '0')}${value}`;
        })
        .join('');
}

/**
 * Check whether a received ASCII string contains a complete TLV message.
 *
 * The Caisse-AP protocol is self-delimiting: each field carries a 3-digit
 * byte length. This function walks the TLV stream and returns true if the
 * entire string is consumed by valid TLV fields (no partial field at the
 * end). This allows the socket handler to close immediately when the
 * response is complete, rather than waiting for an idle timer.
 */
export function isCompleteTlvMessage(data: string): boolean {
    if (!data) return false;
    let i = 0;
    while (i < data.length) {
        // Need at least 2 chars for the tag
        if (i + 2 > data.length) return false;
        i += 2;
        // Need at least 3 chars for the length
        if (i + 3 > data.length) return false;
        const size = parseInt(data.substring(i, i + 3), 10);
        i += 3;
        if (isNaN(size) || size < 0) return false;
        // Need exactly `size` chars for the value
        if (i + size > data.length) return false;
        i += size;
    }
    // Complete if we consumed the entire string with no remainder
    return i === data.length;
}

/** Decode an ASCII TLV wire string into a Caisse-AP message dict. */
export function decodeCaisseApMessage(data: string): CaisseApMessage {
    const result: CaisseApMessage = {};
    let i = 0;
    while (i < data.length) {
        const tag = data.substring(i, i + 2);
        i += 2;
        if (i + 3 > data.length) break;
        const size = parseInt(data.substring(i, i + 3), 10);
        i += 3;
        if (isNaN(size) || i + size > data.length) break;
        result[tag] = data.substring(i, i + size);
        i += size;
    }
    return result;
}

/** Build a payment request message for the Caisse-AP protocol. */
export function buildPaymentRequest(params: {
    amount: number;
    currencyIsoNumber?: string;
    caisseNumber?: string;
    protocolConcertId?: string;
    isReimbursement?: boolean;
    isCheck?: boolean;
}): CaisseApMessage {
    const {
        amount,
        currencyIsoNumber = '978', // EUR
        caisseNumber = '01',
        protocolConcertId = '012345678901',
        isReimbursement = false,
        isCheck = false,
    } = params;

    const amountPositive = Math.abs(amount);
    const amountCent = Math.round(amountPositive * 100); // EUR has 2 decimals
    let amountStr = String(amountCent);
    if (amountStr.length > 12) throw new Error('Amount too large: max 12 digits including cents');
    if (amountStr.length < 2) amountStr = amountStr.padStart(2, '0');

    const msg: CaisseApMessage = {
        CZ: '0300', // Caisse-AP protocol version 3.0
        CJ: protocolConcertId,
        CA: caisseNumber,
        CE: currencyIsoNumber,
        BA: '0', // 0 = answer at end of transaction, 1 = immediate answer
        CD: isReimbursement ? '1' : '0', // 0 = debit, 1 = reimburse
        CB: amountStr,
    };

    if (isCheck) {
        msg.CC = '00C';
    }

    return msg;
}

/** Result of a TPE payment transaction. */
export interface TpePaymentResult {
    success: boolean;
    authorizationNumber?: string;
    cardNumber?: string;
    cardExpiry?: string;
    aid?: string;
    paymentMode?: string;
    cardType?: string;
    sellerContract?: string;
    errorCode?: string;
    errorDetail?: string;
    raw: CaisseApMessage;
}

/** Parse a Caisse-AP response into a structured result. */
export function parsePaymentResponse(response: CaisseApMessage): TpePaymentResult {
    const ae = response['AE']; // Action status
    const af = response['AF']; // Complement of action status (only on failures)

    // AE = '10' => operation done (success)
    // AE = '11' => request taken into account (immediate ack, no final status)
    // AE = '01' => operation not done (failure)
    const success = ae === '10';

    return {
        success,
        authorizationNumber: response['AC'],
        cardNumber: response['AA'],
        cardExpiry: response['AB'],
        aid: response['AI'],
        paymentMode: response['CC'],
        cardType: response['CI'],
        sellerContract: response['CG'],
        errorCode: ae !== '10' ? ae : undefined,
        errorDetail: af,
        raw: response,
    };
}
