import {
    DELETED_KEYWORD,
    PROCESSING_KEYWORD,
    REFUND_KEYWORD,
    UPDATING_KEYWORD,
    WAITING_KEYWORD,
} from '../../utils/constants';
import { Transaction } from '../../utils/interfaces';

export const isWaitingTransaction = (transaction?: Transaction) =>
    Boolean(transaction && transaction.method === WAITING_KEYWORD);

export const isUpdatingTransaction = (transaction?: Transaction) =>
    Boolean(transaction && transaction.method === UPDATING_KEYWORD);

export const isProcessingTransaction = (transaction?: Transaction) =>
    Boolean(transaction && transaction.method === PROCESSING_KEYWORD);

export const isDeletedTransaction = (transaction?: Transaction) =>
    Boolean(transaction && transaction.method === DELETED_KEYWORD);

export const isRefundTransaction = (transaction?: Transaction) =>
    Boolean(transaction && transaction.method === REFUND_KEYWORD);

export const isConfirmedTransaction = (transaction?: Transaction) =>
    Boolean(
        transaction &&
            transaction.method !== undefined &&
            transaction.method !== null &&
            !isWaitingTransaction(transaction) &&
            !isDeletedTransaction(transaction) &&
            !isProcessingTransaction(transaction) &&
            !isUpdatingTransaction(transaction)
    );
