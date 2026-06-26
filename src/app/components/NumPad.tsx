'use client';

import { IconBackspace, IconCalculator, IconSearch, IconShoppingCart, IconWallet } from '@tabler/icons-react';
import { FC, MouseEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { isDeletedTransaction } from '../contexts/dataProvider/transactionHelpers';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePay } from '../hooks/usePay';
import { usePopup } from '../hooks/usePopup';
import { useSummary } from '../hooks/useSummary';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useWindowParam } from '../hooks/useWindowParam';
import { LoadingDot } from '../loading';
import { useScreenSizeConfig } from '../utils/screenSizeConfig';
import { ARROW, WAITING_KEYWORD } from '../utils/constants';
import { Customer, EmptyDiscount, InventoryItem, Mercurial, State, User } from '../utils/interfaces';
import { isMobileSize, useIsMobileDevice } from '../utils/mobile';
import { getPopupStyles, getOptionHoverStyles } from '../utils/popupStyles';
import { Digits } from '../utils/types';
import { Amount } from './Amount';
import { Calculator } from './Calculator';
import { useAddPopupClass } from './Popup';

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
                'w-[72px] h-[72px] sm:w-20 sm:h-20 relative flex justify-center m-2.5 sm:m-3 items-center font-semibold text-2xl sm:text-3xl border-[3px] rounded-2xl',
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

    return (
        <div
            className={twMerge(
                className,
                !isMobileDevice ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : ''
            )}
            onClick={onClick}
            onContextMenu={onClick}
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

    return (
        <div
            className={twMerge(
                className,
                !isMobileDevice ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : ''
            )}
            onClick={onClick}
            onContextMenu={handleContextMenu}
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
    onSelectProduct: (item: { category: string; label: string; amount: number }) => void;
    onSelectCustomer: (customer: Customer) => void;
    onSelectUser: (user: User) => void;
}

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
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        products: true,
        customers: true,
        users: true,
    });
    const inputRef = useRef<HTMLInputElement>(null);
    const isMobileDevice = useIsMobileDevice();
    const styles = getPopupStyles('default');
    const optionClass = twMerge(styles.option, 'px-3', getOptionHoverStyles(isMobileDevice, true));

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const toggleSection = (section: string) => {
        setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    };

    const q = query.toLowerCase();

    const productResults = searchSettings?.searchProducts
        ? inventory
              .flatMap((cat) =>
                  cat.products
                      .map((p) => ({ ...p, category: cat.category }))
                      .filter(
                          (p) =>
                              p.label.toLowerCase().includes(q) ||
                              (p.options && p.options.toLowerCase().includes(q)) ||
                              p.reference?.toLowerCase().includes(q)
                      )
              )
              .slice(0, 10)
        : [];

    const customerResults = searchSettings?.searchCustomers
        ? customers
              .filter(
                  (c) =>
                      c.firstName.toLowerCase().includes(q) ||
                      c.lastName.toLowerCase().includes(q) ||
                      c.reference?.toLowerCase().includes(q)
              )
              .slice(0, 10)
        : [];

    const userResults = searchSettings?.searchUsers
        ? users.filter((u) => u.name.toLowerCase().includes(q) || u.reference?.toLowerCase().includes(q)).slice(0, 10)
        : [];

    const hasResults = productResults.length > 0 || customerResults.length > 0 || userResults.length > 0;

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <input
                ref={inputRef}
                type="text"
                value={query}
                maxLength={10}
                placeholder="Recherche..."
                className={twMerge(
                    'w-full px-3 py-2 bg-transparent border-none outline-none focus:outline-none text-xl font-semibold',
                    'text-popup-dark dark:text-popup-light placeholder:font-normal placeholder:text-gray-400'
                )}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
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
                                productResults.map((item, index) => (
                                    <div
                                        key={`product-${index}`}
                                        className={twMerge(optionClass)}
                                        onClick={() =>
                                            onSelectProduct({
                                                category: item.category,
                                                label: item.label,
                                                amount: item.prices[0],
                                            })
                                        }
                                    >
                                        <div className={styles.optionText}>{item.label}</div>
                                    </div>
                                ))}
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
                                customerResults.map((item) => (
                                    <div
                                        key={`customer-${item.id}`}
                                        className={twMerge(optionClass)}
                                        onClick={() => onSelectCustomer(item)}
                                    >
                                        <div className={styles.optionText}>
                                            {item.firstName} {item.lastName}
                                        </div>
                                    </div>
                                ))}
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
                                userResults.map((item) => (
                                    <div
                                        key={`user-${item.key}`}
                                        className={twMerge(optionClass)}
                                        onClick={() => onSelectUser(item)}
                                    >
                                        <div className={styles.optionText}>
                                            {item.name} ({item.role})
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const NumPad: FC = () => {
    const {
        currencies,
        currencyIndex,
        setCurrency,
        state,
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
    } = useData();
    const { openPopup, closePopup, isPopupOpen, openFullscreenPopup } = usePopup();
    const { pay, canPay, canAddProduct } = usePay();
    const { showTransactionsSummary, showTransactionsSummaryMenu, getHistoricalTransactions, refreshHistoricalKeys } =
        useSummary();

    // Barcode scanner - match by reference
    useBarcodeScanner({
        inventory,
        customers,
        users,
        enabled:
            !!parameters.search?.searchProducts ||
            !!parameters.search?.searchCustomers ||
            !!parameters.search?.searchUsers,
        onMatchProduct: (item) => {
            _addProduct({
                category: item.category,
                quantity: 1,
                amount: item.amount,
                label: item.label,
                discount: EmptyDiscount,
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

    const onClear = useCallback(() => {
        if (selectedProduct) {
            if (quantity || !amount) {
                removeProduct();
            } else {
                setAmount(0);
            }
        } else {
            clearAmount();
        }
    }, [removeProduct, clearAmount, selectedProduct, quantity, setAmount, amount]);

    const onClearTotal = useCallback(() => {
        if (total > 0) {
            openPopup('Supprimer commande ?', ['Oui', 'Non'], (i) => {
                if (i === 0) {
                    clearTotal();
                }
            });
        } else {
            removeProduct();
        }
    }, [removeProduct, clearTotal, openPopup, total]);

    const addProduct = useCallback(() => {
        if (selectedProduct?.amount && quantity) {
            computeQuantity(selectedProduct, selectedProduct.quantity + 1);
        } else {
            _addProduct();
        }
    }, [selectedProduct, computeQuantity, _addProduct, quantity]);

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
        openPopup(
            'Calculatrice',
            [
                <Calculator
                    key={`calculator-${currentValue}-${Math.random()}`}
                    initialValue={currentValue}
                    maxDecimals={maxDecimals}
                    onUseResult={(result) => {
                        if (selectedProduct) {
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
    }, [openPopup, closePopup, setValue, setAmount, maxDecimals, amount, selectedProduct, computeQuantity]);

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
    const sx = s + (canPay || canAddProduct ? color : 'invisible');

    const f = 'text-5xl w-14 h-14 p-2 rounded-full leading-[0.7] ';
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

    // Call useAddPopupClass before any conditional return
    const numPadClass = useAddPopupClass(
        `inset-0 min-w-[375px] w-full self-center absolute md:top-0 md:w-1/2 md:justify-center md:max-w-[50%] ` +
            (shouldUseOverflow
                ? isPopupOpen
                    ? 'top-[76px] '
                    : 'top-32 block overflow-auto '
                : 'flex flex-col justify-center items-center top-20 md:top-0')
    );

    // Show loading animation while state is init, loading, or error (after all hooks are called)
    if (state === State.init || state === State.loading || state === State.error) {
        return (
            <div
                className={numPadClass}
                style={{
                    bottom: `${sizeConfig.numPadBottom}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <LoadingDot />
            </div>
        );
    }

    return (
        <div
            className={numPadClass}
            style={{
                bottom: `${sizeConfig.numPadBottom}px`,
            }}
        >
            <div className="flex flex-col justify-center items-center w-full">
                <div
                    className={
                        shouldUseOverflow
                            ? isPopupOpen
                                ? 'fixed top-0 right-0 max-w-lg md:right-0 '
                                : 'fixed top-[76px] right-0 max-w-lg md:top-0 md:z-10 md:right-1/2 '
                            : 'static max-w-lg w-full '
                    }
                    style={shouldUseOverflow ? { left: left } : {}}
                >
                    <div className="flex justify-around text-4xl text-center font-bold pt-0 max-w-lg w-full self-center">
                        <Amount
                            className={
                                'min-w-[145px] text-right leading-normal ' +
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
                        {hasAmount ? (
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
                        ) : null}
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
                        <ImageButton
                            icon={canPay ? IconWallet : canAddProduct ? IconShoppingCart : IconWallet}
                            className={sx}
                            onClick={canPay ? pay : canAddProduct ? addProduct : () => {}}
                            onContextMenu={
                                canPay ? () => updateTransaction(WAITING_KEYWORD) : canAddProduct ? pay : () => {}
                            }
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
