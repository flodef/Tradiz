// Retry and watchdog helpers for SQL operations.
//
// Serverless Postgres (Neon) and MariaDB connections regularly fail with
// transient errors: the pool hands out a socket that the server already closed,
// a cold start times out, or two concurrent writers deadlock. Those all succeed
// on a second attempt, so they are retried with exponential backoff.
//
// Every attempt is also wrapped in a watchdog so a query that never settles
// cannot hang a request until the platform kills it.

export const DEFAULT_QUERY_TIMEOUT_MS = 15_000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 150;
export const DEFAULT_MAX_DELAY_MS = 2_000;

export class DbTimeoutError extends Error {
    constructor(label: string, timeoutMs: number) {
        super(`Database operation "${label}" timed out after ${timeoutMs}ms`);
        this.name = 'DbTimeoutError';
    }
}

// Driver codes that represent a transient failure rather than a bad query.
const RETRYABLE_CODES = new Set([
    // MySQL / MariaDB
    'PROTOCOL_CONNECTION_LOST',
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ER_LOCK_DEADLOCK',
    'ER_LOCK_WAIT_TIMEOUT',
    'ER_CON_COUNT_ERROR',
    'ER_TOO_MANY_USER_CONNECTIONS',
    // PostgreSQL (SQLSTATE)
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '08004', // sqlserver_rejected_establishment_of_sqlconnection
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    '53300', // too_many_connections
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
    'XX000', // internal_error (Neon returns this while a compute is waking up)
]);

const RETRYABLE_MESSAGE_PATTERNS = [
    'timeout',
    'timed out',
    'connection terminated',
    'connection closed',
    'connection lost',
    'socket hang up',
    'econnreset',
    'server closed the connection',
    'terminating connection',
    'too many connections',
    'deadlock',
    'could not connect',
    'client has encountered a connection error',
];

export function isRetryableDbError(error: unknown): boolean {
    if (error instanceof DbTimeoutError) return true;
    if (!error) return false;

    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && RETRYABLE_CODES.has(code)) return true;

    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => lower.includes(pattern));
}

// Retryable errors where the server actually answered — the socket is still
// healthy, so the connection must NOT be destroyed or marked broken (and a
// retry on the same client is meaningful). Everything else retryable is
// transport-level: a dead or unresponsive socket.
const HEALTHY_SOCKET_RETRYABLE = new Set([
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    'ER_LOCK_DEADLOCK',
    'ER_LOCK_WAIT_TIMEOUT',
]);

// The same lock/serialization failures can surface with no recognized code —
// isRetryableDbError also matches on message text. The server answered, so
// the socket is healthy and the same-client retry stays meaningful.
const HEALTHY_SOCKET_MESSAGE_PATTERNS = ['deadlock', 'serialization', 'lock wait'];

/**
 * True when a retryable error means the socket itself is unusable: network
 * failure, server shutdown, or a watchdog timeout (a query that never settled
 * — the client may still have it pending, so it must not go back to the pool
 * for the next borrower to inherit). Callers should mark the connection
 * broken so end() destroys it instead of recycling a zombie.
 */
export function isBrokenSocketError(error: unknown): boolean {
    if (!isRetryableDbError(error)) return false;
    // A watchdog timeout always means an untrusted socket, whatever the query
    // text happens to contain.
    if (error instanceof DbTimeoutError) return true;
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && HEALTHY_SOCKET_RETRYABLE.has(code)) return false;
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return !HEALTHY_SOCKET_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Watchdog: rejects with a DbTimeoutError if the promise does not settle in time.
 * The underlying promise is not cancellable, so its rejection is swallowed to
 * avoid an unhandled rejection once the watchdog has already fired.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

    let timer: ReturnType<typeof setTimeout>;
    const watchdog = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DbTimeoutError(label, timeoutMs)), timeoutMs);
    });

    return Promise.race([promise, watchdog]).finally(() => {
        clearTimeout(timer);
        promise.catch(() => {});
    }) as Promise<T>;
}

export interface RetryOptions {
    /** Total number of attempts, including the first one. */
    maxAttempts?: number;
    /** Watchdog timeout applied to each individual attempt. */
    timeoutMs?: number;
    /** Delay before the first retry; doubles on each subsequent retry. */
    baseDelayMs?: number;
    /** Upper bound for the backoff delay. */
    maxDelayMs?: number;
    /** Label used in timeout errors and logs. */
    label?: string;
    /** Override which errors are considered transient. */
    shouldRetry?: (error: unknown) => boolean;
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
    // Full jitter avoids a thundering herd when several requests fail together.
    return Math.round(Math.random() * exponential);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` with a per-attempt watchdog and retries transient failures with
 * exponential backoff + jitter. Non-transient errors (bad SQL, constraint
 * violations) are rethrown immediately so real bugs surface fast.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
        maxAttempts = DEFAULT_MAX_ATTEMPTS,
        timeoutMs = DEFAULT_QUERY_TIMEOUT_MS,
        baseDelayMs = DEFAULT_BASE_DELAY_MS,
        maxDelayMs = DEFAULT_MAX_DELAY_MS,
        label = 'query',
        shouldRetry = isRetryableDbError,
    } = options;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await withTimeout(fn(attempt), timeoutMs, label);
        } catch (error) {
            lastError = error;
            if (attempt >= maxAttempts || !shouldRetry(error)) throw error;

            const delay = backoffDelay(attempt, baseDelayMs, maxDelayMs);
            console.warn(
                `[db] "${label}" failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`,
                error instanceof Error ? error.message : String(error)
            );
            await sleep(delay);
        }
    }
    throw lastError;
}
