'use client';

import { encodeURL, findReference, FindReferenceError, ValidateTransferError } from '@solana/pay';
import { Connection, Keypair, PublicKey, TransactionSignature } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { Crypto, CryptoContext, PaymentStatus } from '../hooks/useCrypto';
import { useData } from '../hooks/useData';
import { useWindowParam } from '../hooks/useWindowParam';
import { ENDPOINT, SPL_TOKEN } from '../utils/constants';
import { Confirmations } from '../utils/types';
import { validateTransfer } from '../utils/validateTransfer';

export interface CryptoProviderProps {
    children: ReactNode;
}

export const CryptoProvider: FC<CryptoProviderProps> = ({ children }) => {
    const { total } = useData();
    const { paymentMethods, shopName: label, thanksMessage: message, currencies, currencyIndex } = useConfig();
    const { isOnline } = useWindowParam();

    const requiredConfirmations = 1;

    const [crypto, setCrypto] = useState<Crypto>(Crypto.Solana);
    const splToken = useMemo(() => SPL_TOKEN, []);
    const recipient = useMemo(() => {
        switch (crypto) {
            case Crypto.Solana:
                return new PublicKey(paymentMethods.find((item) => item.method === Crypto.Solana)?.address ?? 0);
            case Crypto.June:
                return new PublicKey(
                    paymentMethods.find((item) => item.method === Crypto.June)?.address?.split(':')[0] ?? 0
                );
            default:
                return new PublicKey(0);
        }
    }, [paymentMethods, crypto]);

    const amount = useMemo(() => BigNumber(total), [total]);
    const connection = useRef(new Connection(ENDPOINT, 'confirmed'));
    const [memo, setMemo] = useState<string>();
    const [reference, setReference] = useState<PublicKey>();
    const [signature, setSignature] = useState<TransactionSignature>();
    const [paymentStatus, setPaymentStatus] = useState(PaymentStatus.New);
    const [error, setError] = useState<Error>();
    const [refresh, setRefresh] = useState(false);
    const refPaymentStatus = useRef(paymentStatus);

    useEffect(() => {
        BigNumber.config({ DECIMAL_PLACES: currencies[currencyIndex].maxDecimals ?? 0 });
    }, [currencies, currencyIndex]);

    useEffect(() => {
        if (error) {
            setPaymentStatus(PaymentStatus.Error);
        }
    }, [error]);

    useEffect(() => {
        refPaymentStatus.current = paymentStatus;
    }, [paymentStatus]);

    const url = useMemo(() => {
        switch (crypto) {
            case Crypto.Solana:
                return encodeURL({
                    recipient,
                    amount,
                    splToken,
                    reference,
                    label,
                    message,
                    memo,
                });
            case Crypto.June:
                const url = new URL('june://' + recipient.toBase58());

                if (amount) {
                    url.searchParams.append('amount', amount.toString());
                }

                return url;
            default:
                return '';
        }
    }, [label, memo, message, recipient, splToken, reference, amount, crypto]);

    const init = useCallback(() => {
        setPaymentStatus(PaymentStatus.New);
        setReference(undefined);
        setError(undefined);
    }, []);

    const generate = useCallback(
        (crypto: Crypto) => {
            setCrypto(crypto);
            setPaymentStatus(PaymentStatus.Pending);
            setReference(crypto === Crypto.Solana ? Keypair.generate().publicKey : undefined);
            setMemo(undefined);
            setSignature(undefined);
            setError(undefined);
            setRefresh(true);
        },
        [setError]
    );

    const retry = useCallback(() => {
        if (refPaymentStatus.current === PaymentStatus.Error) {
            setPaymentStatus(PaymentStatus.Pending);
            setSignature(undefined);
            setError(undefined);
            setRefresh(true);
        }
        watchDog.current = 0;
    }, [setError]);

    // When the status is pending, poll for the transaction using the reference key
    const watchDog = useRef(0);
    useEffect(() => {
        if (!(paymentStatus === PaymentStatus.Pending && reference && !signature && refresh && isOnline)) return;
        let changed = false;

        const interval = setInterval(async () => {
            try {
                const signature = await findReference(connection.current, reference);

                if (!changed) {
                    watchDog.current = 0;
                    clearInterval(interval);
                    setSignature(signature.signature);
                    setPaymentStatus(PaymentStatus.Confirmed);
                }
            } catch (error: any) {
                const isTimeOut = watchDog.current++ > 120;

                // If status is no longer correct or the watch dog has expired, stop polling
                if (paymentStatus !== PaymentStatus.Pending || isTimeOut) {
                    setRefresh(false);
                    watchDog.current = 0;
                    clearInterval(interval);
                    if (isTimeOut) setError(new Error('Transaction timed out'));
                }

                // If the RPC node doesn't have the transaction signature yet, try again
                if (!(error instanceof FindReferenceError)) {
                    setError(error);
                }
            }
        }, 250);

        return () => {
            changed = true;
            watchDog.current = 0;
            clearInterval(interval);
        };
    }, [paymentStatus, reference, signature, connection, setError, refresh, isOnline]);

    // When the status is confirmed, validate the transaction against the provided params
    useEffect(() => {
        if (!(paymentStatus === PaymentStatus.Confirmed && signature && amount)) return;
        let changed = false;

        const run = async () => {
            try {
                await validateTransfer(
                    connection.current,
                    signature,
                    {
                        recipient,
                        amount,
                        splToken,
                        reference,
                    },
                    { maxSupportedTransactionVersion: 0 }
                );
                if (!changed) {
                    setPaymentStatus(PaymentStatus.Valid);
                }
            } catch (error: any) {
                // If status is no longer correct, stop polling
                if (paymentStatus !== PaymentStatus.Confirmed) return;

                // If the RPC node doesn't have the transaction yet, try again
                if (
                    error instanceof ValidateTransferError &&
                    (error.message === 'not found' || error.message === 'missing meta')
                ) {
                    console.warn(error);
                    timeout = setTimeout(run, 250);
                    return;
                }

                setError(error);
            }
        };
        let timeout = setTimeout(run, 0);

        return () => {
            changed = true;
            clearTimeout(timeout);
        };
    }, [paymentStatus, signature, amount, connection, splToken, url, reference, setError, recipient]);

    // When the status is valid, poll for confirmations until the transaction is finalized
    useEffect(() => {
        if (!(paymentStatus === PaymentStatus.Valid && signature)) return;
        let changed = false;

        const interval = setInterval(async () => {
            try {
                const response = await connection.current.getSignatureStatus(signature);
                const status = response.value;
                if (!status) return;
                if (status.err) throw status.err;

                if (!changed) {
                    const confirmations = (status.confirmations || 0) as Confirmations;

                    if (confirmations >= requiredConfirmations || status.confirmationStatus === 'finalized') {
                        clearInterval(interval);
                        setPaymentStatus(PaymentStatus.Finalized);
                    }
                }
            } catch (error: any) {
                setError(error);
            }
        }, 250);

        return () => {
            changed = true;
            clearInterval(interval);
        };
    }, [paymentStatus, signature, connection, requiredConfirmations, setError]);

    const errorText = useMemo(() => {
        const errorCode = error?.message.split(':')[0].trim();
        switch (errorCode) {
            case '401':
                return 'Problème de connection au serveur de paiement !';
        }

        switch (error?.message) {
            case 'WalletNotConnectedError':
                return 'Porte-monnaie non connecté !';
            case 'WalletSignTransactionError':
                return 'Vous avez refusé la transaction !';
            case 'WalletSendTransactionError':
                return 'Vous avez trop tardé à approuver la transaction !';
            case 'TokenAccountNotFoundError':
                return 'Ce commerçant doit ajouter la monnaie "{currency}" à son porte-monnaie !';
            case 'insufficient SOL funds to pay for transaction fee':
                return 'Vous manquez de SOL pour payer les frais de transaction !';
            case 'sender is also recipient':
                return 'Vous êtes en même temps payeur et payé';
            case 'sender not found':
                return 'La monnaie "{currency}" dans votre porte-monnaie est introuvable !';
            case 'sender owner invalid':
                return 'Votre porte-monnaie est invalide !';
            case 'sender executable':
                return 'Votre porte-monnaie est un exécutable / programme !';
            case 'recipient not found':
                return 'La monnaie "{currency}" dans le porte-monnaie de ce commerçant est introuvable !';
            case 'recipient owner invalid':
                return 'Le porte-monnaie de ce commerçant est invalide !';
            case 'recipient executable':
                return 'Le porte-monnaie de ce commerçant est un exécutable / programme !';
            case 'amount decimals invalid':
                return 'Le nombre de décimales du montant est invalide !';
            case 'mint not initialized':
                return 'La monnaie "{currency}" a besoin d\'être initialisé !';
            case 'sender not initialized':
                return "Votre porte-monnaie a besoin d'être initialisé !";
            case 'sender frozen':
                return 'Votre porte-monnaie est gelé; probablement dû à une fraude !';
            case 'recipient not initialized':
                return "Le porte-monnaie de ce commerçant a besoin d'être initialisé !";
            case 'recipient frozen':
                return 'Le porte-monnaie de ce commerçant est gelé; probablement dû à une fraude !';
            case 'insufficient funds':
                return 'Le montant est supérieur à vos fonds !';
            case 'Failed to fetch':
                return 'Échec de récupération des données';
            case 'Transaction timed out':
                return 'La transaction a expiré';
            case 'Message failed to sign':
                return 'Échec de signature du message';
            case 'Airdrop available only on Devnet':
                return "L'airdrop n'est disponible que sur le Devnet";
            case 'FetchDataError':
                return "Avez-vous essayé de lancer avec HTTPS (USE_HTTP=false) et sans proxy local (voir les paramètres d'environnement, .env.local) ?";
            case 'GoogleAuthenticatorError':
                return "Avez-vous essayé de lancer avec GOOGLE_SPREADSHEET_ID / GOOGLE_API_KEY avec les valeurs par défaut (voir les paramètres d'environnement, .env.local) ?";
            case 'RPCError':
                return 'Le serveur de connexion a renvoyé une erreur';
            case 'CreateTransferError':
                return 'Erreur de transfert !';
            case 'NetworkBusyError':
                return 'Le réseau est momentanément saturé, merci de réessayer !';
            case 'InternalError':
                return 'Erreur interne au réseau, merci de réessayer !';
            case 'UnknownError':
                return 'Erreur inconnue : {error}';
            default:
                return '';
        }
    }, [error]);

    return (
        <CryptoContext.Provider
            value={{
                crypto,
                paymentStatus,
                refPaymentStatus,
                url,
                init,
                generate,
                retry,
                error,
                errorText,
            }}
        >
            {children}
        </CryptoContext.Provider>
    );
};
