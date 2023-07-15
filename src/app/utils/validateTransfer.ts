import { Amount, Memo, Recipient, Reference, References, SPLToken } from '@solana/pay';
import {
    decodeInstruction,
    getAssociatedTokenAddress,
    isTransferCheckedInstruction,
    isTransferInstruction,
} from '@solana/spl-token';
import {
    ConfirmedTransactionMeta,
    Connection,
    GetVersionedTransactionConfig,
    LAMPORTS_PER_SOL,
    SIGNATURE_LENGTH_IN_BYTES,
    SystemInstruction,
    Transaction,
    TransactionInstruction,
    TransactionSignature,
    VersionedMessage,
    VersionedTransactionResponse,
} from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import bs58 from 'bs58';
import { MEMO_PROGRAM_ID } from './constants';

/**
 * Thrown when a transaction doesn't contain a valid Solana Pay transfer.
 */
export class ValidateTransferError extends Error {
    name = 'ValidateTransferError';
}

/**
 * Fields of a Solana Pay transfer request to validate.
 */
export interface ValidateTransferFields {
    /** `recipient` in the [Solana Pay spec](https://github.com/solana-labs/solana-pay/blob/master/SPEC.md#recipient). */
    recipient: Recipient;
    /** `amount` in the [Solana Pay spec](https://github.com/solana-labs/solana-pay/blob/master/SPEC.md#amount). */
    amount: Amount;
    /** `spl-token` in the [Solana Pay spec](https://github.com/solana-labs/solana-pay/blob/master/SPEC.md#spl-token). */
    splToken?: SPLToken;
    /** `reference` in the [Solana Pay spec](https://github.com/solana-labs/solana-pay/blob/master/SPEC.md#reference). */
    reference?: References;
    /** `memo` in the [Solana Pay spec](https://github.com/solana-labs/solana-pay/blob/master/SPEC.md#memo). */
    memo?: Memo;
}

/**
 * Check that a given transaction contains a valid Solana Pay transfer.
 *
 * @param connection - A connection to the cluster.
 * @param signature - The signature of the transaction to validate.
 * @param fields - Fields of a Solana Pay transfer request to validate.
 * @param options - Options for `getTransaction`.
 *
 * @throws {ValidateTransferError}
 */
export async function validateTransfer(
    connection: Connection,
    signature: TransactionSignature,
    { recipient, amount, splToken, reference, memo }: ValidateTransferFields,
    options?: GetVersionedTransactionConfig
): Promise<VersionedTransactionResponse> {
    const response: VersionedTransactionResponse | null = await connection.getTransaction(signature, options);
    if (!response) throw new ValidateTransferError('not found');

    const { message, signatures } = response.transaction;
    const meta = response.meta;
    if (!meta) throw new ValidateTransferError('missing meta');
    if (meta.err) throw meta.err;

    if (reference && !Array.isArray(reference)) {
        reference = [reference];
    }

    // Deserialize the transaction and make a copy of the instructions we're going to mutate it.
    const transaction = populate(message, signatures);
    const instructions = transaction.instructions.slice();

    // Transfer instruction must be the last instruction
    const instruction = instructions.pop();
    if (!instruction) throw new ValidateTransferError('missing transfer instruction');
    if (instruction.keys[0].pubkey === instruction.keys[1].pubkey)
        throw new ValidateTransferError('sender is also recipient');
    const [preAmount, postAmount] = splToken
        ? await validateSPLTokenTransfer(instruction, message, meta, recipient, splToken, reference)
        : await validateSystemTransfer(instruction, message, meta, recipient, reference);
    if (postAmount.minus(preAmount).lt(amount)) throw new ValidateTransferError('amount not transferred');

    if (memo !== undefined) {
        // Memo instruction must be the second to last instruction
        const instruction = instructions.pop();
        if (!instruction) throw new ValidateTransferError('missing memo instruction');
        validateMemo(instruction, memo);
    }

    return response;
}

function validateMemo(instruction: TransactionInstruction, memo: string): void {
    // Check that the instruction is a memo instruction with no keys and the expected memo data.
    if (!instruction.programId.equals(MEMO_PROGRAM_ID)) throw new ValidateTransferError('invalid memo program');
    if (instruction.keys.length) throw new ValidateTransferError('invalid memo keys');
    if (!instruction.data.equals(Buffer.from(memo, 'utf8'))) throw new ValidateTransferError('invalid memo');
}

async function validateSystemTransfer(
    instruction: TransactionInstruction,
    message: VersionedMessage,
    meta: ConfirmedTransactionMeta,
    recipient: Recipient,
    references?: Reference[]
): Promise<[BigNumber, BigNumber]> {
    const accountIndex = message.staticAccountKeys.findIndex((pubkey) => pubkey.equals(recipient));
    if (accountIndex === -1) throw new ValidateTransferError('recipient not found');

    if (references) {
        // Check that the instruction is a system transfer instruction.
        SystemInstruction.decodeTransfer(instruction);

        // Check that the expected reference keys exactly match the extra keys provided to the instruction.
        const [_from, _to, ...extraKeys] = instruction.keys;
        const length = extraKeys.length;
        // if (length !== references.length) throw new ValidateTransferError('invalid references');

        for (let i = 0; i < length; i++) {
            if (!extraKeys[i].pubkey.equals(references[i])) throw new ValidateTransferError(`invalid reference ${i}`);
        }
    }

    return [
        new BigNumber(meta.preBalances[accountIndex] || 0).div(LAMPORTS_PER_SOL),
        new BigNumber(meta.postBalances[accountIndex] || 0).div(LAMPORTS_PER_SOL),
    ];
}

async function validateSPLTokenTransfer(
    instruction: TransactionInstruction,
    message: VersionedMessage,
    meta: ConfirmedTransactionMeta,
    recipient: Recipient,
    splToken: SPLToken,
    references?: Reference[]
): Promise<[BigNumber, BigNumber]> {
    const recipientATA = await getAssociatedTokenAddress(splToken, recipient);
    const accountIndex = message.staticAccountKeys.findIndex((pubkey) => pubkey.equals(recipientATA));
    if (accountIndex === -1) throw new ValidateTransferError('recipient not found');

    if (references) {
        // Check that the first instruction is an SPL token transfer instruction.
        const decodedInstruction = decodeInstruction(instruction);
        if (!isTransferCheckedInstruction(decodedInstruction) && !isTransferInstruction(decodedInstruction))
            throw new ValidateTransferError('invalid transfer');

        // Check that the expected reference keys exactly match the extra keys provided to the instruction.
        const extraKeys = decodedInstruction.keys.multiSigners;
        const length = extraKeys.length;
        // if (length !== references.length) throw new ValidateTransferError('invalid references');

        for (let i = 0; i < length; i++) {
            if (!extraKeys[i].pubkey.equals(references[i])) throw new ValidateTransferError(`invalid reference ${i}`);
        }
    }

    const preBalance = meta.preTokenBalances?.find((x) => x.accountIndex === accountIndex);
    const postBalance = meta.postTokenBalances?.find((x) => x.accountIndex === accountIndex);

    return [
        new BigNumber(preBalance?.uiTokenAmount.uiAmountString || 0),
        new BigNumber(postBalance?.uiTokenAmount.uiAmountString || 0),
    ];
}

const DEFAULT_SIGNATURE = Buffer.alloc(SIGNATURE_LENGTH_IN_BYTES).fill(0);

function populate(message: VersionedMessage, signatures: string[] = []) {
    const transaction = new Transaction();
    transaction.recentBlockhash = message.recentBlockhash;

    if (message.header.numRequiredSignatures > 0) {
        transaction.feePayer = message.staticAccountKeys[0];
    }

    signatures.forEach((signature, index) => {
        const sigPubkeyPair = {
            signature: signature == bs58.encode(DEFAULT_SIGNATURE) ? null : Buffer.from(bs58.decode(signature)),
            publicKey: message.staticAccountKeys[index],
        };
        transaction.signatures.push(sigPubkeyPair);
    });
    message.compiledInstructions.forEach((instruction) => {
        const keys = instruction.accountKeyIndexes.map((account) => {
            const pubkey = message.staticAccountKeys[account];
            return {
                pubkey,
                isSigner:
                    transaction.signatures.some(
                        (keyObj) => keyObj.publicKey && pubkey && keyObj.publicKey.toString() === pubkey.toString()
                    ) || message.isAccountSigner(account),
                isWritable: message.isAccountWritable(account),
            };
        });
        transaction.instructions.push(
            new TransactionInstruction({
                keys,
                programId: message.staticAccountKeys[instruction.programIdIndex],
                data: Buffer.from(instruction.data),
            })
        );
    });
    // transaction._message = message;
    // transaction._json = transaction.toJSON();
    return transaction;
}
