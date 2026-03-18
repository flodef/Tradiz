'use client';

import { FC, MouseEventHandler, useEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { sendFatalErrorEmail, sendUserAccessRequest } from '../actions/email';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { useWindowParam } from '../hooks/useWindowParam';
import Loading, { LoadingType } from '../loading';
import { EMAIL, OTHER_KEYWORD } from '../utils/constants';
import { useIsMobileDevice } from '../utils/mobile';
import { getPublicKey } from '../utils/processData';
import { useAddPopupClass } from './Popup';
import { Catalog, CatalogFormula, EmptyDiscount, InventoryItem, Role, State } from '../utils/interfaces';

// Local types for option selection helpers
type OptionDef = { type: string; options: { valeur: string; prix: number | string }[] };
type OptionSel = { type: string; valeur: string; prix: number };

interface CategoryInputButton {
    input: string;
    onInput: (input: string, eventType: string) => void;
    length: number;
}

const CategoryButton: FC<CategoryInputButton> = ({ input, onInput, length }) => {
    const { selectedProduct } = useData();
    const isMobileDevice = useIsMobileDevice();

    const onClick: MouseEventHandler = (e) => {
        e.preventDefault();

        onInput(input, e.type);
    };

    return (
        <div
            className={twMerge(
                { 1: 'w-full', 2: 'w-1/2', 3: 'w-1/3' }[length] ?? 'w-auto',
                'relative flex justify-center h-10 items-center font-semibold text-lg',
                'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark dark:active:text-popup-light',
                !isMobileDevice ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : '',
                selectedProduct?.category === input
                    ? 'bg-active-light dark:bg-active-dark text-popup-dark dark:text-popup-light'
                    : ''
            )}
            onClick={onClick}
            onContextMenu={onClick}
        >
            <div className="line-clamp-2 leading-tight text-center hyphens-auto px-1" lang="fr">
                {input}
            </div>
        </div>
    );
};

export const Category: FC = () => {
    const { inventory, state, setState, currencyIndex, parameters } = useConfig();
    const {
        addProduct,
        amount,
        setSelectedProduct,
        clearAmount,
        clearTotal,
        selectedProduct,
        setOrderId,
        setShortNumOrder,
    } = useData();
    const { openPopup, openFullscreenPopup, closePopup } = usePopup();
    const { isLocalhost, isDemo } = useWindowParam();

    const [hasSentEmail, setHasSentEmail] = useState(false);

    // ── Catalog: lazy-loaded on first interaction, cached for the session ──
    const catalogRef = useRef<Catalog | null>(null);
    const catalogLoadingRef = useRef<Promise<Catalog> | null>(null);
    const loadCatalog = (): Promise<Catalog> => {
        if (catalogRef.current) return Promise.resolve(catalogRef.current);
        if (!catalogLoadingRef.current) {
            catalogLoadingRef.current = fetch('/api/sql/getCatalog')
                .then((r) => r.json())
                .then((data: Catalog) => {
                    catalogRef.current = data;
                    return data;
                });
        }
        return catalogLoadingRef.current;
    };

    // ── Option-selection chain: one popup per option type ──
    const selectOptionsChain = (
        optionTypes: OptionDef[],
        selected: OptionSel[],
        idx: number,
        onDone: (selected: OptionSel[]) => void
    ) => {
        if (idx >= optionTypes.length) {
            onDone(selected);
            return;
        }
        const ot = optionTypes[idx];
        const choices = ot.options.map((o) => {
            const p = parseFloat(String(o.prix)) || 0;
            return p > 0 ? `${o.valeur} (+${p.toFixed(2)}€)` : o.valeur;
        });
        choices.push('Passer');
        openPopup(ot.type, choices, (i) => {
            if (i < 0) return; // X button → abort chain
            const next = [...selected];
            if (i < ot.options.length) {
                // not "Passer"
                const opt = ot.options[i];
                const prix = parseFloat(String(opt.prix)) || 0;
                next.push({ type: ot.type, valeur: opt.valeur, prix });
            }
            selectOptionsChain(optionTypes, next, idx + 1, onDone);
        });
    };

    // ── Formula wizard: one popup per element slot ──
    const selectFormulaElements = (
        formula: CatalogFormula,
        elemIdx: number,
        elements: OptionSel[],
        extraAmount: number,
        onDone: (elements: OptionSel[], extra: number) => void
    ) => {
        if (elemIdx >= formula.elements.length) {
            onDone(elements, extraAmount);
            return;
        }
        const elem = formula.elements[elemIdx];
        openPopup(
            `${elem.nom} (${elemIdx + 1}/${formula.elements.length})`,
            elem.articles.map((a) => a.nom),
            (i) => {
                if (i < 0) return; // X button → abort
                const art = elem.articles[i];
                const afterOptions = (optSel: OptionSel[]) => {
                    const extra = optSel.reduce((s, o) => s + o.prix, 0);
                    const optStr =
                        optSel.length > 0
                            ? ` [${optSel.map((o) => (o.prix > 0 ? `${o.valeur} (+${o.prix.toFixed(2)}€)` : o.valeur)).join(', ')}]`
                            : '';
                    selectFormulaElements(
                        formula,
                        elemIdx + 1,
                        [...elements, { type: 'element', valeur: `${art.nom}${optStr}`, prix: 0 }],
                        extraAmount + extra,
                        onDone
                    );
                };
                if (art.options) {
                    try {
                        const ots: OptionDef[] = JSON.parse(art.options);
                        if (ots.length > 0) {
                            selectOptionsChain(ots, [], 0, afterOptions);
                            return;
                        }
                    } catch {
                        /* ignore */
                    }
                }
                afterOptions([]);
            }
        );
    };

    // ── Unified handler: look up catalog then trigger wizard or direct add ──
    const handleProductSelection = (item: InventoryItem, label: string) => {
        const price = item.products.find((p) => p.label === label)?.prices[currencyIndex];
        const isNewPrice = amount && amount !== selectedProduct?.amount;
        const baseAmount = isNewPrice ? amount : price || 0;

        const doAdd = (extra = 0, options?: OptionSel[]) =>
            addProduct({
                category: item.category,
                label,
                quantity: 1,
                discount: EmptyDiscount,
                amount: baseAmount + extra,
                ...(options && options.length > 0 ? { options: JSON.stringify(options) } : {}),
            });

        loadCatalog()
            .then((catalog) => {
                // Formula?
                const formula = catalog.formulas.find((f) => f.nom === label);
                if (formula && formula.elements.length > 0) {
                    selectFormulaElements(formula, 0, [], 0, (elements, extra) => doAdd(extra, elements));
                    return;
                }
                // Article with options?
                const article = catalog.articles.find((a) => a.nom === label);
                if (article?.options) {
                    try {
                        const ots: OptionDef[] = JSON.parse(article.options);
                        if (ots.length > 0) {
                            selectOptionsChain(ots, [], 0, (selected) =>
                                doAdd(
                                    selected.reduce((s, o) => s + o.prix, 0),
                                    selected
                                )
                            );
                            return;
                        }
                    } catch {
                        /* ignore */
                    }
                }
                doAdd();
            })
            .catch(() => doAdd()); // catalog unavailable → add without options
    };

    useEffect(() => {
        switch (state) {
            case State.error:
                // If the app is running on localhost or demo.tradiz.fr, set the state to done and don't display the error message
                if (isLocalhost || isDemo) {
                    setTimeout(() => setState(State.loaded), 100);
                    return;
                }

                openFullscreenPopup(
                    'Erreur chargement données',
                    [`Utiliser sauvegarde du ${parameters.lastModified}`, 'Réessayer'],
                    (index) => {
                        setState(index === 1 ? State.init : State.loaded);
                    }
                );
                break;
            case State.unidentified:
                openFullscreenPopup(
                    'Utilisateur non identifié',
                    ['Rafraîchir la page'].concat(
                        !hasSentEmail
                            ? Object.values(Role)
                                  .filter((role) => role !== Role.none)
                                  .map((role) => `Demande d'accès ${role}`)
                            : []
                    ),
                    (i) => {
                        if (i >= 1) {
                            sendUserAccessRequest(parameters.shop.email, Object.values(Role)[i], getPublicKey()).then(
                                setHasSentEmail
                            );
                        } else {
                            closePopup();
                            setState(State.init);
                        }
                    },
                    true
                );
                break;
            case State.fatal:
                openFullscreenPopup(
                    'Erreur fatale',
                    ['Rafraîchir la page'].concat(!hasSentEmail ? ['Contacter ' + EMAIL] : []),
                    (i) => {
                        if (i === 1) {
                            sendFatalErrorEmail(parameters.error || 'Erreur inconnue').then(setHasSentEmail);
                        } else {
                            closePopup();
                            setState(State.init);
                        }
                    },
                    true
                );
                break;
        }
    }, [
        state,
        openFullscreenPopup,
        closePopup,
        parameters.lastModified,
        setState,
        parameters.shop.email,
        parameters.error,
        hasSentEmail,
        isDemo,
        isLocalhost,
    ]);

    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.origin !== process.env.NEXT_PUBLIC_WEB_URL) return;
            if (e.data?.type === 'ORDER_ID') {
                clearTotal(); // Clear existing products before adding new ones

                const orderIdFromMessage = e.data.orderId;
                if (!orderIdFromMessage) return;

                setOrderId(orderIdFromMessage);
                fetch(`/api/sql/getOrderItems?orderId=${orderIdFromMessage}`)
                    .then((res) => res.json())
                    .then((data) => {
                        if (data.shortNumOrder) setShortNumOrder(data.shortNumOrder);
                        (data.products || []).forEach(addProduct);
                    });
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Open the product list popup for a category, with ▸ arrows on items that have options ──
    const openProductListPopup = (item: InventoryItem) => {
        setSelectedProduct({
            category: item.category,
            label: OTHER_KEYWORD,
            quantity: 0,
            discount: EmptyDiscount,
            amount: 0,
        });

        const sorted = [...item.products].sort((a, b) => a.label.localeCompare(b.label));

        // Build popup entries: ReactNode with arrow for products with options, plain string otherwise
        const entries: (string | React.ReactNode)[] = sorted.map((p) => {
            const hasOpts = !!p.options;
            if (hasOpts) {
                return (
                    <div key={p.label} className="flex w-full items-center justify-between pr-3">
                        <span>{p.label}</span>
                        <span className="text-secondary-active-light dark:text-secondary-active-dark">▸</span>
                    </div>
                );
            }
            return p.label;
        });
        entries.push('', OTHER_KEYWORD);

        openPopup(item.category, entries, (index, option) => {
            if (index < 0) {
                setSelectedProduct(undefined);
                clearAmount();
                return;
            }
            // "Autre" or separator
            if (index >= sorted.length) {
                handleProductSelection(item, option);
                return;
            }
            const product = sorted[index];
            if (product.options) {
                // Open options sub-popup
                openOptionsSubPopup(item, product);
            } else {
                handleProductSelection(item, product.label);
            }
        });
    };

    // ── Options sub-popup: shows option values for a product with a back button ──
    const openOptionsSubPopup = (
        item: InventoryItem,
        product: { label: string; prices: number[]; options?: string | null }
    ) => {
        let optionTypes: OptionDef[];
        try {
            optionTypes = JSON.parse(product.options!) as OptionDef[];
        } catch {
            // Malformed options → just add product directly
            handleProductSelection(item, product.label);
            return;
        }
        if (!optionTypes || optionTypes.length === 0) {
            handleProductSelection(item, product.label);
            return;
        }

        // Flatten all option choices into a single list
        // For single-type options, show choices directly; for multi-type, chain through selectOptionsChain
        if (optionTypes.length === 1) {
            const ot = optionTypes[0];
            const basePrice = product.prices[currencyIndex] ?? 0;
            const isNewPrice = amount && amount !== selectedProduct?.amount;
            const baseAmount = isNewPrice ? amount : basePrice;

            const choices: string[] = ot.options.map((o) => {
                const p = parseFloat(String(o.prix)) || 0;
                return p !== basePrice && p > 0 ? `${o.valeur} (${p.toFixed(2)}€)` : o.valeur;
            });
            choices.push('', '← Retour');

            openPopup(`${product.label} — ${ot.type}`, choices, (i) => {
                if (i < 0) {
                    // X button → go back to product list
                    openProductListPopup(item);
                    return;
                }
                if (i >= ot.options.length) {
                    // "← Retour" button
                    openProductListPopup(item);
                    return;
                }
                const opt = ot.options[i];
                const prix = parseFloat(String(opt.prix)) || 0;
                const finalAmount = prix > 0 ? prix : baseAmount;
                const selected: OptionSel[] = [{ type: ot.type, valeur: opt.valeur, prix }];
                addProduct({
                    category: item.category,
                    label: product.label,
                    quantity: 1,
                    discount: EmptyDiscount,
                    amount: finalAmount,
                    options: JSON.stringify(selected),
                });
            });
        } else {
            // Multi-type options → use the existing chain, then add product
            const basePrice = product.prices[currencyIndex] ?? 0;
            const isNewPrice = amount && amount !== selectedProduct?.amount;
            const baseAmount = isNewPrice ? amount : basePrice;

            selectOptionsChain(optionTypes, [], 0, (selected) => {
                const extra = selected.reduce((s, o) => s + o.prix, 0);
                addProduct({
                    category: item.category,
                    label: product.label,
                    quantity: 1,
                    discount: EmptyDiscount,
                    amount: baseAmount + extra,
                    options: JSON.stringify(selected),
                });
            });
        }
    };

    const onInput = (input: string, eventType: string) => {
        const item =
            inventory.find(({ category }) => category === input) ??
            inventory.find(({ products }) => products.some(({ label }) => label === input));
        if (!item) return;

        if (eventType === 'contextmenu' || item.products.length === 0) {
            addProduct({
                category: item.category,
                label: OTHER_KEYWORD,
                quantity: 1,
                discount: EmptyDiscount,
                amount: amount,
            });
            return;
        }

        if (item.products.length === 1) {
            const product = item.products[0];
            if (product.options) {
                openOptionsSubPopup(item, product);
            } else {
                handleProductSelection(item, product.label);
            }
            return;
        }

        openProductListPopup(item);
    };

    const categories = useMemo(() => inventory.map(({ category }) => category), [inventory]);

    // 2 columns per row, all categories shown (scroll if > 3 rows)
    const COLS = 2;
    const rows = Array.from({ length: Math.ceil(categories.length / COLS) }, (_, i) =>
        categories.slice(i * COLS, i * COLS + COLS)
    );
    // Row height = h-10 (40px) + 1px divider
    const ROW_HEIGHT = 41;
    const MAX_VISIBLE_ROWS = 3;
    const gridHeight = Math.min(rows.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT;

    const rowClassName = 'flex justify-evenly divide-x divide-active-light dark:divide-active-dark';

    return (
        <div
            className={useAddPopupClass(
                'inset-x-0 border-t-[3px] absolute bottom-0 md:w-1/2 border-active-light dark:border-active-dark overflow-hidden'
            )}
        >
            {(state === State.init || state === State.loading || state === State.error) && (
                <div className="flex items-center justify-center" style={{ height: gridHeight }}>
                    {Loading(LoadingType.Dot, false)}
                </div>
            )}
            {(state === State.preloaded || state === State.loaded) && (
                <div
                    className="divide-y divide-active-light dark:divide-active-dark"
                    style={{
                        maxHeight: MAX_VISIBLE_ROWS * ROW_HEIGHT,
                        overflowY: rows.length > MAX_VISIBLE_ROWS ? 'auto' : 'hidden',
                    }}
                >
                    {rows.map((row, rowIdx) => (
                        <div key={rowIdx} className={rowClassName}>
                            {row.map((category, colIdx) => (
                                <CategoryButton key={colIdx} input={category} onInput={onInput} length={row.length} />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
