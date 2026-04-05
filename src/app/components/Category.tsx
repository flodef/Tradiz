'use client';

import { FC, MouseEventHandler, useEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { sendFatalErrorEmail, sendUserAccessRequest } from '../actions/email';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { useWindowParam } from '../hooks/useWindowParam';
import Loading, { LoadingType } from '../loading';
import { getButtonSizeConfig } from '../utils/buttonSizeConfig';
import { BACK_KEYWORD, CONFIG_KEYWORD, DEV_EMAIL, OTHER_KEYWORD, USE_DIGICARTE } from '../utils/constants';
import { Catalog, CatalogFormula, EmptyDiscount, InventoryItem, Role, State } from '../utils/interfaces';
import { useIsMobileDevice } from '../utils/mobile';
import { getPublicKey } from '../utils/processData';
import { ButtonSize } from '../utils/types';
import { useAddPopupClass } from './Popup';

export const CATEGORY_BUTTON_SIZE: ButtonSize = 'xl';

// Local types for option selection helpers
type OptionDef = { type: string; options: { valeur: string; prix: number | string }[] };
type OptionSel = { type: string; valeur: string; prix: number };

interface CategoryInputButton {
    input: string;
    onInput: (input: string, eventType: string) => void;
    length: number;
    size?: ButtonSize;
}

const CategoryButton: FC<CategoryInputButton> = ({ input, onInput, length, size = 'md' }) => {
    const { selectedProduct } = useData();
    const isMobileDevice = useIsMobileDevice();
    const sizeConfig = getButtonSizeConfig(size);

    const onClick: MouseEventHandler = (e) => {
        e.preventDefault();

        onInput(input, e.type);
    };

    return (
        <div
            className={twMerge(
                { 1: 'w-full', 2: 'w-1/2', 3: 'w-1/3' }[length] ?? 'w-auto',
                `relative flex justify-center ${sizeConfig.tailwindClass} items-center font-semibold text-xl`,
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
    const { addProduct, amount, setSelectedProduct, clearAmount, selectedProduct } = useData();
    const { openPopup, updatePopup, openFullscreenPopup, closePopup } = usePopup();
    const { isLocalhost, isDemo } = useWindowParam();

    const [hasSentEmail, setHasSentEmail] = useState(false);

    // ── Catalog: lazy-loaded on first interaction, cached for the session ──
    const catalogRef = useRef<Catalog | null>(null);
    const catalogLoadingRef = useRef<Promise<Catalog> | null>(null);
    const loadCatalog = (): Promise<Catalog> => {
        if (catalogRef.current) return Promise.resolve(catalogRef.current);
        if (!USE_DIGICARTE) return Promise.resolve({ articles: [], formulas: [] });

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
    // basePrice: when > 0, option prices are supplements (displayed with +);
    //            when 0, option prices are standalone (displayed without +).
    const selectOptionsChain = (
        optionTypes: OptionDef[],
        selected: OptionSel[],
        idx: number,
        onDone: (selected: OptionSel[]) => void,
        basePrice = 0
    ) => {
        if (idx >= optionTypes.length) {
            onDone(selected);
            return;
        }
        const ot = optionTypes[idx];
        const choices = ot.options.map((o) => {
            const p = parseFloat(String(o.prix)) || 0;
            if (p <= 0) return o.valeur;
            return basePrice > 0 ? `${o.valeur} (+${p.toFixed(2)}€)` : `${o.valeur} (${p.toFixed(2)}€)`;
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
            selectOptionsChain(optionTypes, next, idx + 1, onDone, basePrice);
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
                            selectOptionsChain(ots, [], 0, afterOptions, Number(art.prix) || 0);
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
                            selectOptionsChain(
                                ots,
                                [],
                                0,
                                (selected) =>
                                    doAdd(
                                        selected.reduce((s, o) => s + o.prix, 0),
                                        selected
                                    ),
                                Number(article.prix) || 0
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

                // Check if there are saved parameters in localStorage
                const savedParameters = localStorage.getItem(CONFIG_KEYWORD);
                if (!savedParameters) {
                    // No saved data, set state to fatal
                    setTimeout(() => setState(State.fatal), 100);
                    return;
                }

                // Has saved data, extract lastModified from saved parameters
                const parsedParams = JSON.parse(savedParameters);
                const savedLastModified = parsedParams?.lastModified;
                openFullscreenPopup(
                    'Erreur chargement données',
                    [
                        `Utiliser ${savedLastModified ? 'sauvegarde du ' + savedLastModified : 'dernières sauvegarde'}`,
                        'Réessayer',
                    ],
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
                    ['Rafraîchir la page'].concat(!hasSentEmail ? ['Contacter ' + DEV_EMAIL] : []),
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

    // Saved scroll position of the product list popup so we can restore it when coming back from options
    const productListScrollRef = useRef(0);

    // Helper: get current popup scroll position
    const getPopupScroll = () => document.getElementById('popup')?.scrollTop ?? 0;

    // ── Build the product list popup content for a category ──
    const buildProductListPopup = (item: InventoryItem) => {
        const sorted = [...item.products].sort((a, b) => a.label.localeCompare(b.label));
        const ARROW = ' ▸';
        const entries: string[] = sorted.map((p) => (p.options ? `${p.label}${ARROW}` : p.label));
        entries.push('', OTHER_KEYWORD);

        const action = (index: number, option: string) => {
            if (index < 0) {
                // Popup is already being closed by the overlay/X button
                setSelectedProduct(undefined);
                clearAmount();
                return;
            }
            if (index >= sorted.length) {
                closePopup(() => handleProductSelection(item, option));
                return;
            }
            const product = sorted[index];
            if (product.options) {
                productListScrollRef.current = getPopupScroll();
                openOptionsSubPopup(item, product);
            } else {
                closePopup(() => handleProductSelection(item, product.label));
            }
        };

        return { title: item.category, entries, action };
    };

    // ── Open the product list popup (first time — popup not yet visible) ──
    const openProductListPopup = (item: InventoryItem) => {
        setSelectedProduct({
            category: item.category,
            label: OTHER_KEYWORD,
            quantity: 0,
            discount: EmptyDiscount,
            amount: 0,
        });
        const { title, entries, action } = buildProductListPopup(item);
        openPopup(title, entries, action, true);
    };

    // ── Return to the product list popup in-place (no close/reopen) ──
    const returnToProductListPopup = (item: InventoryItem) => {
        const { title, entries, action } = buildProductListPopup(item);
        updatePopup(title, entries, action, productListScrollRef.current);
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
            handleProductSelection(item, product.label);
            return;
        }
        if (!optionTypes || optionTypes.length === 0) {
            handleProductSelection(item, product.label);
            return;
        }

        if (optionTypes.length === 1) {
            const ot = optionTypes[0];
            const basePrice = product.prices[currencyIndex] ?? 0;
            const isNewPrice = amount && amount !== selectedProduct?.amount;
            const baseAmount = isNewPrice ? amount : basePrice;

            const choices: string[] = ot.options.map((o) => {
                const p = parseFloat(String(o.prix)) || 0;
                if (p <= 0) return o.valeur;
                return basePrice > 0 ? `${o.valeur} (+${p.toFixed(2)}€)` : `${o.valeur} (${p.toFixed(2)}€)`;
            });
            choices.push('', BACK_KEYWORD);

            // Update popup content in-place (no flicker)
            updatePopup(`${product.label} — ${ot.type}`, choices, (i) => {
                if (i < 0) {
                    // X/overlay close — popup is already closing
                    setSelectedProduct(undefined);
                    clearAmount();
                    return;
                }
                if (i >= ot.options.length) {
                    // "← Retour" button — go back to product list in-place
                    returnToProductListPopup(item);
                    return;
                }
                const opt = ot.options[i];
                const prix = parseFloat(String(opt.prix)) || 0;
                const finalAmount = basePrice > 0 ? baseAmount + prix : prix > 0 ? prix : baseAmount;
                const selected: OptionSel[] = [{ type: ot.type, valeur: opt.valeur, prix }];
                closePopup(() =>
                    addProduct({
                        category: item.category,
                        label: product.label,
                        quantity: 1,
                        discount: EmptyDiscount,
                        amount: finalAmount,
                        options: JSON.stringify(selected),
                    })
                );
            });
        } else {
            const basePrice = product.prices[currencyIndex] ?? 0;
            const isNewPrice = amount && amount !== selectedProduct?.amount;
            const baseAmount = isNewPrice ? amount : basePrice;

            selectOptionsChain(
                optionTypes,
                [],
                0,
                (selected) => {
                    const extra = selected.reduce((s, o) => s + o.prix, 0);
                    addProduct({
                        category: item.category,
                        label: product.label,
                        quantity: 1,
                        discount: EmptyDiscount,
                        amount: baseAmount + extra,
                        options: JSON.stringify(selected),
                    });
                },
                basePrice
            );
        }
    };

    const onInput = (input: string, eventType: string) => {
        const item =
            displayInventory.find(({ category }) => category === input) ??
            displayInventory.find(({ products }) => products.some(({ label }) => label === input));
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

    const displayInventory = useMemo(
        () =>
            inventory
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((item) => ({
                    ...item,
                    products: item.products.filter((p) => p.availability).sort((a, b) => a.order - b.order),
                }))
                .filter((item) => item.products.length > 0 || true), // keep category even if empty (for OTHER_KEYWORD)
        [inventory]
    );

    const categories = useMemo(() => displayInventory.map(({ category }) => category), [displayInventory]);

    // 2 columns per row, all categories shown (scroll if > 3 rows)
    const sizeConfig = getButtonSizeConfig(CATEGORY_BUTTON_SIZE);
    const COLS = 2;
    const rows = Array.from({ length: Math.ceil(categories.length / COLS) }, (_, i) =>
        categories.slice(i * COLS, i * COLS + COLS)
    );
    const ROW_HEIGHT = sizeConfig.rowHeight;
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
                                <CategoryButton
                                    key={colIdx}
                                    input={category}
                                    onInput={onInput}
                                    length={row.length}
                                    size={CATEGORY_BUTTON_SIZE}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
