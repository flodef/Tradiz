'use client';

import { IconBackspace, IconCalculator, IconSearch, IconShoppingCart, IconWallet, IconX } from '@tabler/icons-react';
import { FC, MouseEventHandler, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { isDeletedTransaction } from '../contexts/dataProvider/transactionHelpers';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePay } from '../hooks/usePay';
import { usePopup } from '../hooks/usePopup';
import { useSummary } from '../hooks/useSummary';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useWindowParam } from '../hooks/useWindowParam';
import { useScreenSizeConfig } from '../utils/screenSizeConfig';
import { ARROW, WAITING_KEYWORD } from '../utils/constants';
import { Customer, EmptyDiscount, InventoryItem, Mercurial, User } from '../utils/interfaces';
import { isMobileSize, useIsMobileDevice, useLongPressContextMenu } from '../utils/mobile';
import { getPopupStyles, getOptionHoverStyles } from '../utils/popupStyles';
import { Digits } from '../utils/types';
import { Amount } from './Amount';
import { Calculator } from './Calculator';
import CustomerDetailsPopup from './CustomerDetailsPopup';
import { useAddPopupClass } from './Popup';
import { UserSwitchPopup } from './UserSwitchPopup';
import { useVirtualKeyboardContext } from './admin/VirtualKeyboardProvider';

export const MIN_QUANTITY = 0.125;
export const quantityHalving = (quantity: number, key: Digits | string): number =>
    ({
        '½': Math.max(0.125, (quantity > 0 && quantity < 1 ? quantity : 1) / 2),
        '¼': Math.max(0.125, (quantity > 0 && quantity < 1 ? quantity : 1) / 4),
    })[key.toString()] ?? parseInt(quantity >= 1 ? (quantity.toString() + key).replace(/^0{2,}/, '0') : key.toString());

interface NumPadButtonProps {
    input: Digits | string;
    onInput(key: Digits | string): void;
    onContextMenu?: () => void;
    className?: string;
}

const NumPadButton: FC<NumPadButtonProps> = ({ input, onInput }) => {
    const { isStateReady } = useConfig();
    const isMobileDevice = useIsMobileDevice();

    const onClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();

            if (!isStateReady) return;

            onInput(input);
        },
        [onInput, input, isStateReady]
    );

    return (
        <div
            className={twMerge(
                'w-18 h-18 sm:w-20 sm:h-20 relative flex justify-center m-2.5 sm:m-3 items-center font-semibold text-2xl sm:text-3xl border-[3px] rounded-2xl',
                'border-secondary-light dark:border-secondary-dark shadow-xl',
                isStateReady
                    ? 'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark dark:active:text-popup-light'
                    : '',
                !isMobileDevice ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : ''
            )}
            onClick={onClick}
            onContextMenu={onClick}
        >
            {input}
        </div>
    );
};

const FunctionButton: FC<NumPadButtonProps> = ({ input, onInput, onContextMenu, className }) => {
    const { isStateReady } = useConfig();
    const isMobileDevice = useIsMobileDevice();

    const onClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();

            if (!isStateReady) return;

            if (e.type === 'click') {
                onInput(input);
            } else if (e.type === 'contextmenu' && onContextMenu) {
                onContextMenu();
            }
        },
        [onInput, onContextMenu, input, isStateReady]
    );

    const longPressHandlers = useLongPressContextMenu(() => {
        if (isStateReady && onContextMenu) onContextMenu();
    });

    return (
        <div
            className={twMerge(
                className,
                !isMobileDevice ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : ''
            )}
            onClick={onClick}
            onContextMenu={onClick}
            {...longPressHandlers}
        >
            {input}
        </div>
    );
};

interface ImageButtonProps {
    icon: FC<{ size: number }>;
    iconSize?: number;
    onClick: () => void;
    onContextMenu: () => void;
    className?: string;
}
const ImageButton: FC<ImageButtonProps> = ({ icon: Icon, iconSize = 42, onClick, onContextMenu, className }) => {
    const isMobileDevice = useIsMobileDevice();
    const handleContextMenu = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            onContextMenu();
        },
        [onContextMenu]
    );

    const longPressHandlers = useLongPressContextMenu(onContextMenu);

    return (
        <div
            className={twMerge(
                className,
                !isMobileDevice ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : ''
            )}
            onClick={onClick}
            onContextMenu={handleContextMenu}
            {...longPressHandlers}
        >
            <Icon size={iconSize} />
        </div>
    );
};

interface SearchPopupProps {
    inventory: InventoryItem[];
    customers: Customer[];
    users: User[];
    searchSettings?: { searchCustomers: boolean; searchProducts: boolean; searchUsers: boolean };
    onSelectProduct: (item: { category: string; label: string; amount: number; employerShare?: number }) => void;
    onSelectCustomer: (customer: Customer) => void;
    onSelectUser: (user: User) => void;
}

interface ProductWithCategory {
    category: string;
    label: string;
    prices: number[];
    options?: string | null;
    stock: number | null;
    order: number;
    reference?: string | null;
    employerShare?: number | null;
}

type SearchItem =
    | { type: 'product'; data: ProductWithCategory; index: number }
    | { type: 'customer'; data: Customer; index: number }
    | { type: 'user'; data: User; index: number };

const SearchPopup: FC<SearchPopupProps> = ({
    inventory,
    customers,
    users,
    searchSettings,
    onSelectProduct,
    onSelectCustomer,
    onSelectUser,
}) => {
    const [query, setQuery] = useState('');
    const [rawInput, setRawInput] = useState('');
    const inputDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const lastKeyTimeRef = useRef(0);
    const isScanInputRef = useRef(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        products: true,
        customers: true,
        users: true,
    });
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const isMobileDevice = useIsMobileDevice();
    const styles = getPopupStyles('default');
    const optionClass = twMerge(styles.option, 'px-3', getOptionHoverStyles(isMobileDevice, true));
    const vkContext = useVirtualKeyboardContext();

    // Refs to keep the virtual keyboard enter handler in sync with the latest
    // highlighted index and items, since the handler closure is captured once
    // at focus time and would otherwise be stale after typing.
    const highlightedIndexRef = useRef(highlightedIndex);
    const allItemsRef = useRef<SearchItem[]>([]);

    useEffect(() => {
        inputRef.current?.focus();
        // Reset scanner detection when popup opens
        isScanInputRef.current = false;
        lastKeyTimeRef.current = 0;
    }, []);

    // Debounce query: scanner can send input twice in rapid succession.
    // A short debounce collapses duplicate scans into a single query.
    useEffect(() => {
        if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current);
        inputDebounceRef.current = setTimeout(() => {
            setQuery(rawInput);
        }, 50);
        return () => {
            if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current);
        };
    }, [rawInput]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
            itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [highlightedIndex]);

    const toggleSection = (section: string) => {
        setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    };

    const q = query.toLowerCase();

    const productResults = useMemo(
        (): ProductWithCategory[] =>
            searchSettings?.searchProducts
                ? inventory
                      .flatMap((cat) =>
                          cat.products
                              .map((p) => ({ ...p, category: cat.category }) as ProductWithCategory)
                              .filter(
                                  (p) =>
                                      p.label.toLowerCase().includes(q) ||
                                      (p.options && p.options.toLowerCase().includes(q)) ||
                                      p.reference?.toLowerCase().includes(q)
                              )
                      )
                      .slice(0, 10)
                : [],
        [inventory, searchSettings?.searchProducts, q]
    );

    const customerResults = useMemo(
        () =>
            searchSettings?.searchCustomers
                ? customers
                      .filter(
                          (c) =>
                              c.firstName.toLowerCase().includes(q) ||
                              c.lastName.toLowerCase().includes(q) ||
                              c.reference?.toLowerCase().includes(q)
                      )
                      .slice(0, 10)
                : [],
        [customers, searchSettings?.searchCustomers, q]
    );

    const userResults = useMemo(
        () =>
            searchSettings?.searchUsers
                ? users
                      .filter((u) => u.name.toLowerCase().includes(q) || u.reference?.toLowerCase().includes(q))
                      .slice(0, 10)
                : [],
        [users, searchSettings?.searchUsers, q]
    );

    // Build flat list of all items for keyboard navigation
    const allItems = useMemo((): SearchItem[] => {
        const items: SearchItem[] = [];
        let idx = 0;

        if (searchSettings?.searchProducts && expandedSections.products) {
            productResults.forEach((item) => {
                items.push({ type: 'product', data: item, index: idx++ });
            });
        }
        if (searchSettings?.searchCustomers && expandedSections.customers) {
            customerResults.forEach((item) => {
                items.push({ type: 'customer', data: item, index: idx++ });
            });
        }
        if (searchSettings?.searchUsers && expandedSections.users) {
            userResults.forEach((item) => {
                items.push({ type: 'user', data: item, index: idx++ });
            });
        }

        return items;
    }, [productResults, customerResults, userResults, expandedSections, searchSettings]);

    // Keep refs in sync so the VK enter handler always sees the latest values
    useEffect(() => {
        allItemsRef.current = allItems;
    }, [allItems]);
    useEffect(() => {
        highlightedIndexRef.current = highlightedIndex;
    }, [highlightedIndex]);

    // Get category boundaries
    const categoryBoundaries = useMemo(() => {
        const boundaries: { [key: string]: { start: number; end: number } } = {};
        let idx = 0;

        if (searchSettings?.searchProducts && expandedSections.products && productResults.length > 0) {
            boundaries.products = { start: idx, end: idx + productResults.length - 1 };
            idx += productResults.length;
        }
        if (searchSettings?.searchCustomers && expandedSections.customers && customerResults.length > 0) {
            boundaries.customers = { start: idx, end: idx + customerResults.length - 1 };
            idx += customerResults.length;
        }
        if (searchSettings?.searchUsers && expandedSections.users && userResults.length > 0) {
            boundaries.users = { start: idx, end: idx + userResults.length - 1 };
        }

        return boundaries;
    }, [productResults, customerResults, userResults, expandedSections, searchSettings]);

    // Auto-highlight first item when query changes and there are results
    useEffect(() => {
        const newIndex = query && allItems.length > 0 ? 0 : -1;
        setHighlightedIndex(newIndex);
        // Update the ref synchronously so the VK enter handler sees the correct
        // index immediately, without waiting for a second render cycle.
        highlightedIndexRef.current = newIndex;
    }, [query, allItems.length]);

    // Auto-select when exactly one result matches (e.g. barcode scan in search mode)
    const selectItem = useCallback(
        (item: SearchItem) => {
            if (item.type === 'product') {
                onSelectProduct({
                    category: item.data.category,
                    label: item.data.label,
                    amount: item.data.prices[0],
                    employerShare: item.data.employerShare ?? undefined,
                });
            } else if (item.type === 'customer') {
                onSelectCustomer(item.data);
            } else if (item.type === 'user') {
                onSelectUser(item.data);
            }
        },
        [onSelectProduct, onSelectCustomer, onSelectUser]
    );

    // Auto-select when exactly one result matches AND input came from a barcode scan
    useEffect(() => {
        if (query && allItems.length === 1 && isScanInputRef.current) {
            selectItem(allItems[0]);
        }
    }, [query, allItems, selectItem]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Detect barcode scanner: rapid keystrokes (<30ms apart) are scanner input
        const now = Date.now();
        if (e.key.length === 1) {
            const interval = now - lastKeyTimeRef.current;
            if (lastKeyTimeRef.current > 0 && interval < 30) {
                isScanInputRef.current = true;
            } else {
                isScanInputRef.current = false;
            }
            lastKeyTimeRef.current = now;
        }

        if (allItems.length === 0) return;

        const categoryCount = Object.keys(categoryBoundaries).length;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev < allItems.length - 1 ? prev + 1 : prev));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
                break;
            case 'ArrowRight':
                e.preventDefault();
                setHighlightedIndex((prev) => {
                    if (prev < 0) return 0;
                    if (categoryCount > 1) {
                        // Try to move to next category
                        const currentCategory = Object.entries(categoryBoundaries).find(
                            ([, bounds]) => prev >= bounds.start && prev <= bounds.end
                        );
                        if (currentCategory) {
                            const categories = Object.keys(categoryBoundaries);
                            const currentIdx = categories.indexOf(currentCategory[0]);
                            const nextCategory = categories[currentIdx + 1];
                            if (nextCategory) {
                                return categoryBoundaries[nextCategory].start;
                            } else {
                                // No next category, move down 5
                                return Math.min(prev + 5, allItems.length - 1);
                            }
                        } else {
                            // Not found in any category, move down 5
                            return Math.min(prev + 5, allItems.length - 1);
                        }
                    } else {
                        // Single category, move down 5 items
                        return Math.min(prev + 5, allItems.length - 1);
                    }
                });
                break;
            case 'ArrowLeft':
                e.preventDefault();
                setHighlightedIndex((prev) => {
                    if (prev < 0) return 0;
                    if (categoryCount > 1) {
                        // Try to move to previous category
                        const currentCat = Object.entries(categoryBoundaries).find(
                            ([, bounds]) => prev >= bounds.start && prev <= bounds.end
                        );
                        if (currentCat) {
                            const categories = Object.keys(categoryBoundaries);
                            const currentIdx = categories.indexOf(currentCat[0]);
                            const prevCategory = categories[currentIdx - 1];
                            if (prevCategory) {
                                return categoryBoundaries[prevCategory].start;
                            } else {
                                // No previous category, move up 5
                                return Math.max(prev - 5, 0);
                            }
                        } else {
                            // Not found in any category, move up 5
                            return Math.max(prev - 5, 0);
                        }
                    } else {
                        // Single category, move up 5 items
                        return Math.max(prev - 5, 0);
                    }
                });
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < allItems.length) {
                    selectItem(allItems[highlightedIndex]);
                } else if (allItems.length > 0) {
                    selectItem(allItems[0]);
                }
                break;
        }
    };

    const hasResults = productResults.length > 0 || customerResults.length > 0 || userResults.length > 0;

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <input
                ref={inputRef}
                type="text"
                value={rawInput}
                maxLength={10}
                placeholder="Recherche..."
                className={twMerge(
                    'w-full px-3 py-2 bg-transparent border-none outline-none focus:outline-none text-xl font-semibold',
                    'text-popup-dark dark:text-popup-light placeholder:font-normal placeholder:text-gray-400'
                )}
                autoFocus
                onChange={(e) => setRawInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={(e) => {
                    if (vkContext) {
                        vkContext.registerInput(e.target, (newValue: string) => setRawInput(newValue));
                        vkContext.registerEnterHandler(() => {
                            const idx = highlightedIndexRef.current;
                            const items = allItemsRef.current;
                            if (idx >= 0 && idx < items.length) {
                                selectItem(items[idx]);
                            } else if (items.length > 0) {
                                selectItem(items[0]);
                            }
                        });
                    }
                }}
                onBlur={(e) => {
                    if (vkContext) {
                        vkContext.unregisterInput(e.target);
                        vkContext.registerEnterHandler(null);
                    }
                }}
            />
            {query && (
                <div className="max-h-[55vh] overflow-y-auto">
                    {!hasResults && (
                        <div className={twMerge(styles.optionText, 'py-4 text-center text-gray-400')}>
                            Aucun résultat
                        </div>
                    )}
                    {productResults.length > 0 && (
                        <div className="mt-2">
                            <div
                                className={twMerge(styles.optionText, styles.separator, 'cursor-pointer')}
                                onClick={() => toggleSection('products')}
                            >
                                PRODUITS {!expandedSections.products && ARROW}
                            </div>
                            {expandedSections.products &&
                                productResults.map((item, index) => {
                                    const globalIndex = index;
                                    return (
                                        <div
                                            key={`product-${index}`}
                                            ref={(el) => {
                                                itemRefs.current[globalIndex] = el;
                                            }}
                                            className={twMerge(
                                                optionClass,
                                                highlightedIndex === globalIndex &&
                                                    'bg-active-light dark:bg-active-dark'
                                            )}
                                            onClick={() =>
                                                onSelectProduct({
                                                    category: item.category,
                                                    label: item.label,
                                                    amount: item.prices[0],
                                                    employerShare: item.employerShare ?? undefined,
                                                })
                                            }
                                        >
                                            <div className={styles.optionText}>{item.label}</div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}

                    {customerResults.length > 0 && (
                        <div className="mt-2">
                            <div
                                className={twMerge(styles.optionText, styles.separator, 'cursor-pointer')}
                                onClick={() => toggleSection('customers')}
                            >
                                CLIENTS {!expandedSections.customers && ARROW}
                            </div>
                            {expandedSections.customers &&
                                customerResults.map((item, index) => {
                                    const globalIndex =
                                        (searchSettings?.searchProducts && expandedSections.products
                                            ? productResults.length
                                            : 0) + index;
                                    return (
                                        <div
                                            key={`customer-${item.id}`}
                                            ref={(el) => {
                                                itemRefs.current[globalIndex] = el;
                                            }}
                                            className={twMerge(
                                                optionClass,
                                                highlightedIndex === globalIndex &&
                                                    'bg-active-light dark:bg-active-dark'
                                            )}
                                            onClick={() => onSelectCustomer(item)}
                                        >
                                            <div className={styles.optionText}>
                                                {item.firstName} {item.lastName}
                                                {item.company ? ` (${item.company})` : ''}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}

                    {userResults.length > 0 && (
                        <div className="mt-2">
                            <div
                                className={twMerge(styles.optionText, styles.separator, 'cursor-pointer')}
                                onClick={() => toggleSection('users')}
                            >
                                UTILISATEURS {!expandedSections.users && ARROW}
                            </div>
                            {expandedSections.users &&
                                userResults.map((item, index) => {
                                    const globalIndex =
                                        (searchSettings?.searchProducts && expandedSections.products
                                            ? productResults.length
                                            : 0) +
                                        (searchSettings?.searchCustomers && expandedSections.customers
                                            ? customerResults.length
                                            : 0) +
                                        index;
                                    return (
                                        <div
                                            key={`user-${item.id ?? index}`}
                                            ref={(el) => {
                                                itemRefs.current[globalIndex] = el;
                                            }}
                                            className={twMerge(
                                                optionClass,
                                                highlightedIndex === globalIndex &&
                                                    'bg-active-light dark:bg-active-dark'
                                            )}
                                            onClick={() => onSelectUser(item)}
                                        >
                                            <div className={styles.optionText}>
                                                {item.name} ({item.role})
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const NumPad: FC<{ displayOnly?: boolean }> = ({ displayOnly = false }) => {
    const {
        currencies,
        currencyIndex,
        setCurrency,
        isStateReady,
        discounts,
        parameters,
        setParameters,
        inventory,
        customers,
        users,
    } = useConfig();

    const {
        total,
        amount,
        setAmount,
        clearAmount,
        quantity,
        setQuantity,
        computeQuantity,
        setDiscount,
        setCurrentMercurial,
        removeProduct,
        clearTotal,
        selectedProduct,
        updateTransaction,
        transactions,
        isDbConnected,
        addProduct: _addProduct,
        setCurrentCustomer,
        currentCustomer,
        toCurrency,
    } = useData();
    const { openPopup, closePopup, isPopupOpen, openFullscreenPopup } = usePopup();
    const { pay, canAddProduct } = usePay();
    const { showTransactionsSummary, showTransactionsSummaryMenu, getHistoricalTransactions, refreshHistoricalKeys } =
        useSummary();

    // Barcode scanner - match by reference (always enabled, not gated by search settings)
    useBarcodeScanner({
        inventory,
        customers,
        users,
        onMatchProduct: (item) => {
            _addProduct({
                category: item.category,
                quantity: 1,
                amount: item.amount,
                label: item.label,
                discount: EmptyDiscount,
                employerShare: item.employerShare,
            });
        },
        onMatchCustomer: (customer) => {
            setCurrentCustomer(customer);
        },
        onMatchUser: (user) => {
            setParameters({ ...parameters, user });
        },
    });

    // Use hook for screen size config with hydration safety
    const sizeConfig = useScreenSizeConfig();

    useEffect(() => {
        refreshHistoricalKeys();
    }, [refreshHistoricalKeys]);

    const maxValue = useMemo(() => currencies[currencyIndex].maxValue, [currencies, currencyIndex]);
    const maxDecimals = useMemo(() => currencies[currencyIndex].decimals, [currencies, currencyIndex]);
    const max = useMemo(() => maxValue * Math.pow(10, maxDecimals), [maxValue, maxDecimals]);
    const regExp = useMemo(() => new RegExp('^\\d*([.,]\\d{0,' + maxDecimals + '})?$'), [maxDecimals]);

    const [value, setValue] = useState('0');
    const [customerBalance, setCustomerBalance] = useState<number | null>(currentCustomer?.balance ?? null);

    useEffect(() => {
        if (!currentCustomer?.id) {
            setCustomerBalance(null);
            return;
        }
        setCustomerBalance(currentCustomer.balance ?? null);
        fetch(`/api/sql/getCustomerBalance?customerId=${currentCustomer.id}`)
            .then((res) => res.json())
            .then(({ balance }: { balance?: number }) => setCustomerBalance(Number(balance ?? 0)))
            .catch((error) => console.error('Failed to fetch customer balance:', error));
    }, [currentCustomer?.id, currentCustomer?.balance]);

    // Get window parameters for layout calculations
    const { width, height } = useWindowParam();

    const onInput = useCallback(
        (key: Digits | string) => {
            if (!quantity) {
                let newValue = (value + key).trim().replace(/^0{2,}/, '0');
                if (newValue) {
                    newValue = /^[.,]/.test(newValue) ? `0${newValue}` : newValue.replace(/^0+(\d)/, '$1');
                    if (regExp.test(newValue)) {
                        newValue = parseFloat(newValue) <= max ? newValue : max.toString();
                        setValue(newValue);
                        if (selectedProduct) {
                            // selectedProduct is intentionally the SAME object as the matching
                            // entry in products.current (a ref, not state). computeQuantity
                            // mutates it and updateTotal() re-reads products.current, so the
                            // mutation is load-bearing — copying here would break the total
                            // and the reference-identity check in deleteProduct.
                            selectedProduct.amount = parseFloat(newValue) / Math.pow(10, maxDecimals);
                            computeQuantity(selectedProduct, selectedProduct.quantity);
                            setQuantity(0);
                        }
                    }
                }
            } else {
                const newQuantity = quantityHalving(quantity, key);
                if (selectedProduct) {
                    computeQuantity(selectedProduct, newQuantity);
                } else {
                    setQuantity(newQuantity);
                    setAmount(amount * newQuantity);
                }
            }
        },
        [
            max,
            regExp,
            quantity,
            computeQuantity,
            selectedProduct,
            value,
            setValue,
            maxDecimals,
            setQuantity,
            setAmount,
            amount,
        ]
    );

    const onClearTotal = useCallback(() => {
        if (total > 0) {
            openPopup('Supprimer commande ?', ['Oui', 'Non'], (i) => {
                if (i === 0) {
                    clearTotal();
                }
            });
        } else {
            removeProduct();
            setQuantity(-1);
        }
    }, [removeProduct, clearTotal, openPopup, total, setQuantity]);

    const onClear = useCallback(() => {
        if (selectedProduct) {
            if (quantity || !amount) {
                removeProduct();
                setQuantity(-1);
            } else {
                setAmount(0);
            }
            return;
        }
        // Nothing selected and nothing typed: there is nothing to erase, so offer to drop the order
        if (!amount) {
            onClearTotal();
            return;
        }
        clearAmount();
    }, [removeProduct, clearAmount, selectedProduct, quantity, setAmount, setQuantity, amount, onClearTotal]);

    const showCurrencies = useCallback(() => {
        if (currencies.length < 2) return;

        openPopup(
            'Changer ' + currencies[currencyIndex].label + ' pour :',
            currencies.filter((_, index) => index !== currencyIndex).map(({ label }) => label),
            (index, option) => {
                if (index === -1) return;

                if (total) {
                    openPopup(
                        'Ticket en cours...',
                        ['Effacer le ticket', 'Payer le ticket'],
                        (index) => {
                            switch (index) {
                                case 0:
                                    clearTotal();
                                    setCurrency(option);
                                    closePopup();
                                    break;
                                case 1:
                                    pay();
                                    break;
                                default:
                                    closePopup(showCurrencies);
                                    return;
                            }
                        },
                        true
                    );
                } else {
                    closePopup();

                    setCurrency(option);
                    const index = currencies.findIndex(({ label }) => label === option);
                    const maxDecimals = currencies[index].decimals;
                    const amount = selectedProduct?.amount ?? 0;
                    setValue((amount * Math.pow(10, maxDecimals)).toString());
                    setQuantity(0);
                }
            },
            true
        );
    }, [
        openPopup,
        currencies,
        currencyIndex,
        setCurrency,
        total,
        setQuantity,
        selectedProduct,
        closePopup,
        clearTotal,
        pay,
    ]);

    const multiply = useCallback(() => {
        if (selectedProduct) {
            computeQuantity(selectedProduct, 1);
            setAmount(quantity ? 0 : selectedProduct.amount);
        } else {
            setAmount(quantity ? parseFloat(value) / Math.pow(10, maxDecimals) : amount);
        }
        setQuantity(quantity ? 0 : -1);
    }, [setQuantity, quantity, computeQuantity, selectedProduct, setAmount, value, maxDecimals, amount]);

    const discount = useCallback(() => {
        if (!discounts.length || !selectedProduct) return;
        const displayDiscounts = (
            discounts.some((discount) => discount.amount === 0) ? discounts : [EmptyDiscount].concat(discounts)
        )
            .filter((d) => d !== selectedProduct.discount)
            .sort((a, b) => a.amount - b.amount);
        openPopup(
            `Remise (${selectedProduct.discount.amount ? selectedProduct.discount.amount + selectedProduct.discount.unit : 'Aucune'})`,
            displayDiscounts.map((d) => (d.amount ? d.amount + d.unit : ['Aucune'])),
            (index) => setDiscount(selectedProduct, index < 0 ? selectedProduct.discount : displayDiscounts[index])
        );
    }, [openPopup, selectedProduct, discounts, setDiscount]);

    const openSearchPopup = useCallback(() => {
        const content = (
            <SearchPopup
                inventory={inventory}
                customers={customers}
                users={users}
                searchSettings={parameters.search}
                onSelectProduct={(item) => {
                    _addProduct({
                        category: item.category,
                        quantity: 1,
                        amount: item.amount,
                        label: item.label,
                        discount: EmptyDiscount,
                        employerShare: item.employerShare,
                    });
                    closePopup();
                }}
                onSelectCustomer={(customer) => {
                    setCurrentCustomer(customer);
                    closePopup();
                }}
                onSelectUser={(user) => {
                    setParameters({ ...parameters, user });
                    closePopup();
                }}
            />
        );

        openFullscreenPopup('Recherche', [content], () => {}, true);
    }, [
        openFullscreenPopup,
        closePopup,
        inventory,
        customers,
        users,
        parameters,
        setParameters,
        _addProduct,
        setCurrentCustomer,
    ]);

    const mercuriale = useCallback(() => {
        const mercurials = Object.values(Mercurial);
        openPopup('Fonction coût quadratique', mercurials, (index) => {
            if (quantity === 0) {
                multiply();
            }
            setCurrentMercurial(mercurials[index]);
        });
    }, [setCurrentMercurial, openPopup, quantity, multiply]);

    const openCalculator = useCallback(() => {
        const currentValue = selectedProduct?.total ?? amount;
        openFullscreenPopup(
            'Calculatrice',
            [
                <Calculator
                    key={`calculator-${currentValue}-${Math.random()}`}
                    initialValue={currentValue}
                    maxDecimals={maxDecimals}
                    onUseResult={(result) => {
                        if (selectedProduct) {
                            // Mutation is intentional — see the comment in the key handler above.
                            selectedProduct.amount = result;
                            computeQuantity(selectedProduct, selectedProduct.quantity);
                        } else {
                            setValue((result * Math.pow(10, maxDecimals)).toShortFixed(0));
                            setAmount(result);
                        }
                        closePopup();
                    }}
                />,
            ],
            () => {},
            true
        );
    }, [openFullscreenPopup, closePopup, setValue, setAmount, maxDecimals, amount, selectedProduct, computeQuantity]);

    useEffect(() => {
        setAmount(parseInt(value) / Math.pow(10, maxDecimals));
    }, [value, setAmount, maxDecimals]);
    useEffect(() => {
        if (!amount) setValue('0');
    }, [amount]);

    const NumPadList: Digits[][] = [
        [7, 8, 9],
        [4, 5, 6],
        [1, 2, 3],
    ];

    const hasAmount = selectedProduct || amount;
    const hasSearchEnabled =
        parameters.search?.searchCustomers || parameters.search?.searchProducts || parameters.search?.searchUsers;
    const color = isStateReady
        ? 'active:bg-secondary-active-light dark:active:bg-secondary-active-dark ' +
          'text-secondary-light dark:text-secondary-dark active:text-popup-dark dark:active:text-popup-light '
        : '';
    const s =
        'w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-2xl flex justify-center m-2.5 sm:m-3 items-center text-5xl sm:text-6xl ';
    const sx = s + (canAddProduct || total ? color : 'invisible');

    const f = 'text-5xl w-14 h-14 p-2 rounded-full leading-[0.7] ';

    // Shared props for the pay button (used in both displayOnly and non-displayOnly layouts)
    const actionButtonProps = {
        icon: IconWallet,
        onClick: () => {
            clearAmount();
            pay();
        },
        onContextMenu: total ? () => updateTransaction(WAITING_KEYWORD) : () => {},
    };

    // Cart button for the bottom row: adds the currently selected product to the cart
    const cartButtonProps = {
        icon: IconShoppingCart,
        onClick: canAddProduct ? () => _addProduct() : () => {},
        onContextMenu: canAddProduct ? () => _addProduct() : () => {},
    };
    const f1 = f + (hasAmount || total ? color : 'invisible');
    const f2 =
        f +
        (hasAmount
            ? quantity
                ? 'bg-secondary-active-light dark:bg-secondary-active-dark text-popup-dark dark:text-popup-light '
                : color
            : 'invisible');
    const f3 =
        f +
        (transactions.filter((tx) => !isDeletedTransaction(tx)).length ||
        getHistoricalTransactions().length ||
        isDbConnected
            ? color
            : 'invisible');

    const shouldUseOverflow = useMemo(
        () => (height < 590 && !isMobileSize()) || (height < 660 && isMobileSize()),
        [height]
    );
    const left = useMemo(() => Math.max(((isMobileSize() ? width : width / 2) - 512) / 2, 0), [width]);

    // Measure container height for displayOnly vertical positioning
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(0);
    useLayoutEffect(() => {
        if (!displayOnly || !containerRef.current) return;
        const el = containerRef.current;
        const update = () => setContainerHeight(el.clientHeight);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [displayOnly]);

    // NumPad vertical positioning in catalog mode:
    // - container < 164px: align to bottom (justify-end)
    // - container >= 164px: top at 72px (justify-start + padding-top)
    const NUMPAD_HEIGHT = 92;
    const TOPNAV_BOTTOM = 72;
    const displayJustify = containerHeight < TOPNAV_BOTTOM + NUMPAD_HEIGHT ? 'justify-end' : 'justify-start';
    const displayPaddingTop = containerHeight >= TOPNAV_BOTTOM + NUMPAD_HEIGHT ? TOPNAV_BOTTOM : 0;

    // Call useAddPopupClass before any conditional return
    const numPadClass = useAddPopupClass(
        displayOnly
            ? `relative w-1/2 h-full flex flex-col items-center ${displayJustify} `
            : `inset-0 min-w-[375px] w-full self-center absolute md:top-10 md:w-1/2 md:justify-center md:max-w-[50%] ` +
                  (shouldUseOverflow
                      ? isPopupOpen
                          ? 'top-[76px] '
                          : 'top-32 block overflow-auto '
                      : 'flex flex-col justify-center items-center top-20 md:top-0')
    );

    const isNegativeBalance = customerBalance !== null && customerBalance < 0;

    return (
        <div
            ref={displayOnly ? containerRef : undefined}
            className={numPadClass}
            style={{
                bottom: displayOnly ? 'auto' : `${sizeConfig.numPadBottom}px`,
                paddingTop: displayOnly ? `${displayPaddingTop}px` : undefined,
            }}
        >
            <div className="flex flex-col justify-center items-center w-full">
                <div
                    className={
                        displayOnly
                            ? 'static w-full '
                            : shouldUseOverflow
                              ? isPopupOpen
                                  ? 'fixed top-0 right-0 max-w-lg md:right-0 '
                                  : 'fixed top-19 right-0 max-w-lg md:top-0 md:z-10 md:right-1/2 '
                              : 'static max-w-lg w-full '
                    }
                    style={displayOnly ? {} : shouldUseOverflow ? { left: left } : {}}
                >
                    {(currentCustomer || parameters.user) && (
                        <div className="flex items-center justify-center gap-2 text-lg font-semibold">
                            <span
                                className={twMerge(
                                    'whitespace-nowrap overflow-hidden',
                                    currentCustomer ||
                                        (!currentCustomer && parameters.userSwitch !== false && users.length > 1)
                                        ? 'cursor-pointer p-1 rounded hover:bg-active-light dark:hover:bg-active-dark'
                                        : ''
                                )}
                                onClick={
                                    currentCustomer
                                        ? () =>
                                              openFullscreenPopup(
                                                  `${currentCustomer.firstName} ${currentCustomer.lastName}${currentCustomer.company ? ` (${currentCustomer.company})` : ''}`,
                                                  [<CustomerDetailsPopup key="details" customer={currentCustomer} />],
                                                  () => {},
                                                  true
                                              )
                                        : !currentCustomer && parameters.userSwitch !== false && users.length > 1
                                          ? () =>
                                                openFullscreenPopup(
                                                    "Changer d'utilisateur",
                                                    [
                                                        <UserSwitchPopup
                                                            key="userSwitch"
                                                            onSelect={(user) => setParameters({ ...parameters, user })}
                                                        />,
                                                    ],
                                                    () => {},
                                                    true
                                                )
                                          : undefined
                                }
                            >
                                {currentCustomer
                                    ? `${isNegativeBalance ? '⚠️' : ''} Client : ${isMobileSize() ? `${currentCustomer.firstName.charAt(0)}.` : currentCustomer.firstName} ${currentCustomer.lastName}${currentCustomer.company ? ` (${currentCustomer.company})` : ''}`
                                    : parameters.user.name}
                                {currentCustomer && customerBalance !== null && (
                                    <span
                                        className={twMerge(
                                            'text-sm font-semibold whitespace-nowrap',
                                            isNegativeBalance && 'text-red-600 dark:text-red-400 animate-pulse'
                                        )}
                                    >
                                        {isNegativeBalance
                                            ? ` [- ${toCurrency(Math.abs(customerBalance))}]`
                                            : ` [${toCurrency(customerBalance)}]`}
                                    </span>
                                )}
                                {currentCustomer && (currentCustomer.fidelityPoints ?? 0) > 0 && (
                                    <span className="text-sm font-semibold whitespace-nowrap text-green-600 dark:text-green-400">
                                        {' '}
                                        [★ {(currentCustomer.fidelityPoints ?? 0).toFixed(2)} pts]
                                    </span>
                                )}
                            </span>
                            {currentCustomer && (
                                <button
                                    onClick={() =>
                                        openPopup('⚠️ Supprimer le client ?', ['Confirmer', 'Annuler'], (i) => {
                                            if (i === 0) setCurrentCustomer(null);
                                        })
                                    }
                                    className="shrink-0 p-1 hover:bg-active-light dark:hover:bg-active-dark rounded"
                                >
                                    <IconX size={24} stroke={3} />
                                </button>
                            )}
                        </div>
                    )}
                    <div className="flex justify-around text-4xl text-center font-bold pt-0 max-w-lg w-full self-center">
                        <Amount
                            className={
                                'min-w-36.25 text-right leading-normal ' +
                                ((selectedProduct && !amount) || (quantity === 0 && amount) ? 'animate-blink' : '')
                            }
                            value={selectedProduct?.total ?? amount}
                            showZero
                            onClick={showCurrencies}
                        />
                        <ImageButton
                            icon={IconBackspace}
                            className={f1}
                            onClick={onClear}
                            onContextMenu={onClearTotal}
                        />
                        {displayOnly ? (
                            hasSearchEnabled ? (
                                <ImageButton
                                    icon={IconSearch}
                                    className={f + color}
                                    onClick={openSearchPopup}
                                    onContextMenu={openSearchPopup}
                                />
                            ) : hasAmount || total ? (
                                <ImageButton {...actionButtonProps} className={f + (total ? color : 'invisible')} />
                            ) : (
                                <div className={f2}></div>
                            )
                        ) : hasAmount ? (
                            <FunctionButton
                                className={f2}
                                input="&times;"
                                onInput={multiply}
                                onContextMenu={discount ?? mercuriale}
                            />
                        ) : hasSearchEnabled ? (
                            <ImageButton
                                icon={IconSearch}
                                className={f + color}
                                onClick={openSearchPopup}
                                onContextMenu={openSearchPopup}
                            />
                        ) : (
                            <div className={f2}></div>
                        )}
                        <ImageButton
                            icon={IconCalculator}
                            className={f + color}
                            onClick={openCalculator}
                            onContextMenu={openCalculator}
                        />
                        <FunctionButton
                            className={f3}
                            input="z"
                            onInput={() => showTransactionsSummary(showTransactionsSummaryMenu)}
                            onContextMenu={showTransactionsSummaryMenu}
                        />
                    </div>
                </div>

                {!displayOnly && (
                    <div
                        className={
                            'max-w-lg w-full self-center md:top-14 overflow-auto bottom-0 ' +
                            (shouldUseOverflow ? (isPopupOpen ? ' top-14 absolute ' : ' top-0 absolute ') : ' static ')
                        }
                    >
                        {NumPadList.map((row, index) => (
                            <div className="flex justify-evenly" key={index}>
                                {row.map((input) => (
                                    <NumPadButton input={input} onInput={onInput} key={input} />
                                ))}
                            </div>
                        ))}
                        <div className="flex justify-evenly">
                            <NumPadButton input={0} onInput={onInput} />
                            <NumPadButton input={!quantity ? '00' : '½'} onInput={onInput} />
                            {canAddProduct ? (
                                <ImageButton {...cartButtonProps} className={sx} />
                            ) : (
                                <ImageButton {...actionButtonProps} className={sx} />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
