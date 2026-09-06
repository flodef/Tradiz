import {
    CANCELLED_KEYWORD,
    DELETED_KEYWORD,
    EXPUNGED_KEYWORD,
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

export const isCancelledTransaction = (transaction?: Transaction) =>
    Boolean(transaction && transaction.method === CANCELLED_KEYWORD);

export const isExpungedTransaction = (transaction?: Transaction) =>
    Boolean(transaction && transaction.method === EXPUNGED_KEYWORD);

export const isRemovedTransaction = (transaction?: Transaction) =>
    isDeletedTransaction(transaction) || isCancelledTransaction(transaction) || isExpungedTransaction(transaction);

export const isRefundTransaction = (transaction?: Transaction) =>
    Boolean(transaction && transaction.method === REFUND_KEYWORD);

export const isConfirmedTransaction = (transaction?: Transaction) =>
    Boolean(
        transaction &&
        transaction.method !== undefined &&
        transaction.method !== null &&
        !isWaitingTransaction(transaction) &&
        !isRemovedTransaction(transaction) &&
        !isProcessingTransaction(transaction) &&
        !isUpdatingTransaction(transaction)
    );
