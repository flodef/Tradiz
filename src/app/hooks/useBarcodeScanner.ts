'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Customer, InventoryItem, User } from '../utils/interfaces';

interface UseBarcodeScannerProps {
    inventory: InventoryItem[];
    customers: Customer[];
    users: User[];
    onMatchProduct: (item: { category: string; label: string; amount: number }) => void;
    onMatchCustomer: (customer: Customer) => void;
    onMatchUser: (user: User) => void;
    enabled?: boolean;
}

const BARCODE_TIMEOUT = 100; // ms between keystrokes to consider it a barcode scan
const BARCODE_MIN_LENGTH = 3; // ignore shorter buffers that are likely manual keystrokes
const BARCODE_DEBOUNCE = 300; // ms to prevent duplicate scans

export function useBarcodeScanner({
    inventory,
    customers,
    users,
    onMatchProduct,
    onMatchCustomer,
    onMatchUser,
    enabled = true,
}: UseBarcodeScannerProps) {
    const bufferRef = useRef('');
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastScanRef = useRef(0);

    const processCode = useCallback(
        (code: string) => {
            // Match against products (exact match — case matters for references)
            const productMatch = inventory
                .flatMap((cat) =>
                    cat.products.map((p) => ({ ...p, category: cat.category })).filter((p) => p.reference === code)
                )
                .at(0);

            if (productMatch) {
                onMatchProduct({
                    category: productMatch.category,
                    label: productMatch.label,
                    amount: productMatch.prices[0],
                });
                return;
            }

            // Match against customers (exact match)
            const customerMatch = customers.find((c) => c.reference === code);
            if (customerMatch) {
                onMatchCustomer(customerMatch);
                return;
            }

            // Match against users (exact match)
            const userMatch = users.find((u) => u.reference === code);
            if (userMatch) {
                onMatchUser(userMatch);
            }
        },
        [inventory, customers, users, onMatchProduct, onMatchCustomer, onMatchUser]
    );

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if in an input field
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLSelectElement
            ) {
                return;
            }

            // Enter key triggers the scan
            if (e.key === 'Enter') {
                const code = bufferRef.current;
                bufferRef.current = '';
                if (code.length >= BARCODE_MIN_LENGTH) {
                    // Debounce: ignore duplicate scans within BARCODE_DEBOUNCE ms
                    const now = Date.now();
                    if (now - lastScanRef.current < BARCODE_DEBOUNCE) return;
                    lastScanRef.current = now;

                    e.preventDefault();
                    processCode(code);
                }
                return;
            }

            // Ignore non-printable keys
            if (e.key.length !== 1) return;

            // Add to buffer
            bufferRef.current += e.key;

            // Clear buffer if no keystrokes for a while
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                bufferRef.current = '';
            }, BARCODE_TIMEOUT);
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [enabled, processCode]);
}
