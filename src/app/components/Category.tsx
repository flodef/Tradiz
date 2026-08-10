'use client';

import { FC, MouseEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { twMerge } from 'tailwind-merge';
import { sendFatalErrorEmail, sendMissingParametersRequest, sendUserAccessRequest } from '../actions/email';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { useWindowParam } from '../hooks/useWindowParam';
import { useScreenSizeConfig } from '../utils/screenSizeConfig';
import {
    ARROW,
    BACK_KEYWORD,
    CONFIG_KEYWORD,
    DEV_EMAIL,
    OTHER_KEYWORD,
    ROLE_LABELS,
    USE_DIGICARTE,
} from '../utils/constants';
import { Catalog, CatalogFormula, EmptyDiscount, InventoryItem, Role, State } from '../utils/interfaces';
import { useIsMobile, useIsMobileDevice } from '../utils/mobile';
import { getPublicKey } from '../utils/processData';
import { colorToHex } from '../utils/colors';
import { useAddPopupClass } from './Popup';

// Local types for option selection helpers
type OptionDef = { type: string; options: { value: string; price: number | string }[] };
type OptionSel = { type: string; value: string; price: number };

type FormulaDefinition = {
    formula: true;
    elements: { name: string; category?: string; products?: string[] }[];
    originalName?: string;
};

function isSingleElementFormula(options: string | null | undefined): boolean {
    if (!options) return false;
    try {
        const parsed = JSON.parse(options) as FormulaDefinition;
        if (!parsed.formula || !Array.isArray(parsed.elements) || parsed.elements.length === 0) return false;
        return parsed.elements.length === 1;
    } catch {
        return false;
    }
}

function buildCatalogFormula(
    product: InventoryItem['products'][number],
    parsed: FormulaDefinition,
    inventory: InventoryItem[],
    currencyIndex: number
): CatalogFormula | null {
    const price = product.prices[currencyIndex] ?? product.prices[0] ?? 0;
    const elements = parsed.elements
        .map((element, index) => {
            let choices: InventoryItem['products'] = [];
            if (element.category) {
                inventory.forEach((category) => {
                    if (category.category === element.category) {
                        choices.push(...category.products);
                    }
                });
            } else if (element.products?.length) {
                inventory.forEach((category) => {
                    category.products.forEach((p) => {
                        if (element.products?.includes(p.label)) {
                            choices.push(p);
                        }
                    });
                });
            }
            if (choices.length === 0) return null;
            choices = choices.filter((p, i, arr) => arr.findIndex((x) => x.label === p.label) === i);
            return {
                id: `${product.label}-${index}`,
                nom: element.name,
                category: element.category,
                articles: choices.map((p, articleIndex) => ({
                    id: articleIndex,
                    nom: p.label,
                    prix: p.prices[currencyIndex] ?? p.prices[0] ?? 0,
                    options: p.options || null,
                })),
            };
        })
        .filter(Boolean) as CatalogFormula['elements'];

    if (elements.length === 0) return null;
    return { id: product.label, nom: parsed.originalName || product.label, prix: price, elements };
}

interface CategoryInputButton {
    input: string;
    onInput: (input: string, eventType: string) => void;
    length: number;
    sizeConfig: ReturnType<typeof useScreenSizeConfig>;
}

const CategoryButton: FC<CategoryInputButton> = ({ input, onInput, length, sizeConfig }) => {
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

export const Category: FC<{ catalogMode?: boolean }> = ({ catalogMode = false }) => {
    const { inventory, state, setState, currencyIndex, parameters, categories: configCategories } = useConfig();
    const { addProduct, amount, setSelectedProduct, clearAmount, selectedProduct, toCurrency, currentCustomer } =
        useData();
    const { openPopup, updatePopup, openFullscreenPopup, closePopup } = usePopup();
    const { isLocalhost, isDemo } = useWindowParam();

    const [hasSentEmail, setHasSentEmail] = useState(false);

    // Use hook for screen size config with hydration safety
    const sizeConfig = useScreenSizeConfig();

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
        if (!ot || !ot.options || !Array.isArray(ot.options)) {
            onDone(selected);
            return;
        }
        const choices = ot.options.map((o) => {
            const p = parseFloat(String(o.price)) || 0;
            if (p <= 0) return o.value;
            return basePrice > 0 ? `${o.value} (+${p.toFixed(2)}€)` : `${o.value} (${p.toFixed(2)}€)`;
        });
        choices.push('Passer');
        openPopup(ot.type, choices, (i) => {
            if (i < 0) return; // X button → abort chain
            const next = [...selected];
            if (i < ot.options.length) {
                // not "Passer"
                const opt = ot.options[i];
                const price = parseFloat(String(opt.price)) || 0;
                next.push({ type: ot.type, value: opt.value, price });
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
        // Products-based element: auto-add all articles without a popup
        if (!elem.category) {
            const newElements = elem.articles.map((art) => ({
                type: 'element' as const,
                value: art.nom,
                price: 0,
            }));
            selectFormulaElements(formula, elemIdx + 1, [...elements, ...newElements], extraAmount, onDone);
            return;
        }
        // Category-based element: show popup for user to choose
        const elementLabel = elem.nom ? `${formula.nom} - ${elem.nom}` : formula.nom;
        openPopup(
            `${elementLabel} (${elemIdx + 1}/${formula.elements.length})`,
            elem.articles.map((a) => a.nom),
            (i) => {
                if (i < 0) return; // X button → abort
                const art = elem.articles[i];
                const afterOptions = (optSel: OptionSel[]) => {
                    const extra = optSel.reduce((s, o) => s + o.price, 0);
                    const optStr =
                        optSel.length > 0
                            ? ` [${optSel.map((o) => (o.price > 0 ? `${o.value} (+${o.price.toFixed(2)}€)` : o.value)).join(', ')}]`
                            : '';
                    selectFormulaElements(
                        formula,
                        elemIdx + 1,
                        [...elements, { type: 'element', value: `${art.nom}${optStr}`, price: 0 }],
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
        const product = item.products.find((p) => p.label === label);
        const price = product?.prices[currencyIndex];
        const isNewPrice = amount && amount !== selectedProduct?.amount;
        const baseAmount = isNewPrice ? amount : price || 0;

        const doAdd = (extra = 0, options?: OptionSel[]) =>
            addProduct({
                category: item.category,
                label,
                quantity: 1,
                discount: EmptyDiscount,
                amount: baseAmount + extra,
                vatRate: item.rate,
                ...(options && options.length > 0 ? { options: JSON.stringify(options) } : {}),
            });

        if (product?.options) {
            try {
                const parsed = JSON.parse(product.options) as FormulaDefinition;
                if (parsed.formula && Array.isArray(parsed.elements)) {
                    const formula = buildCatalogFormula(product, parsed, inventory, currencyIndex);
                    if (formula && formula.elements.length > 0) {
                        selectFormulaElements(formula, 0, [], 0, (elements, extra) => doAdd(extra, elements));
                        return;
                    }
                }
            } catch {
                // Not a formula definition, continue with catalog lookup
            }
        }

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
                        const parsed = JSON.parse(article.options);
                        // Handle both formats: single object {type, options} or array of objects
                        const ots: OptionDef[] = Array.isArray(parsed) ? parsed : [parsed];
                        if (ots.length > 0) {
                            selectOptionsChain(
                                ots,
                                [],
                                0,
                                (selected) =>
                                    doAdd(
                                        selected.reduce((s, o) => s + o.price, 0),
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
                // If the app is running in dev (localhost without Electron) or demo.tradiz.fr, set the state to done and don't display the error message
                if ((isLocalhost && !window.electronAPI) || isDemo) {
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
                const rawLastModified = parsedParams?.lastModified;
                const savedLastModified =
                    rawLastModified && !Number.isNaN(Number(rawLastModified))
                        ? new Date(Number(rawLastModified)).toLocaleString()
                        : rawLastModified;
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
            case State.unidentified: {
                const accessRoles = Object.values(Role).filter((role) => role !== Role.admin);
                const unidentifiedOptions = (
                    !hasSentEmail ? accessRoles.map((role) => `Demande d'accès ${ROLE_LABELS[role]}`) : []
                ).concat(['Rafraîchir la page']);
                openFullscreenPopup(
                    'Utilisateur non identifié',
                    unidentifiedOptions,
                    (i) => {
                        if (i < unidentifiedOptions.length - 1) {
                            sendUserAccessRequest(parameters.shop.email, accessRoles[i], getPublicKey()).then(
                                setHasSentEmail
                            );
                        } else {
                            setHasSentEmail(false);
                            closePopup();
                            setState(State.init);
                        }
                    },
                    true
                );
                break;
            }
            case State.missingData:
                openFullscreenPopup(
                    'Données manquantes',
                    ["Demander l'accès", 'Rafraîchir la page'],
                    async (i) => {
                        if (i === 0) {
                            const publicKey = getPublicKey();
                            const success = await sendMissingParametersRequest(publicKey, parameters.shop.email);
                            if (success) {
                                openFullscreenPopup(
                                    'Demande envoyée',
                                    ['OK'],
                                    () => {
                                        closePopup();
                                    },
                                    true
                                );
                            } else {
                                openFullscreenPopup(
                                    "Erreur lors de l'envoi",
                                    ['OK'],
                                    () => {
                                        closePopup();
                                    },
                                    true
                                );
                            }
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
        const entries: string[] = sorted.map((p) =>
            p.options && !isSingleElementFormula(p.options) ? `${p.label}${ARROW}` : p.label
        );
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
            if (product.options && !isSingleElementFormula(product.options)) {
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
            const parsed = JSON.parse(product.options!);
            // Handle both formats: single object {type, options} or array of objects
            optionTypes = Array.isArray(parsed) ? parsed : [parsed];
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
            if (!ot.options || !Array.isArray(ot.options)) {
                // Invalid options, just add product without options
                handleProductSelection(item, product.label);
                return;
            }
            const basePrice = product.prices[currencyIndex] ?? 0;
            const isNewPrice = amount && amount !== selectedProduct?.amount;
            const baseAmount = isNewPrice ? amount : basePrice;

            const choices: string[] = ot.options.map((o) => {
                const p = parseFloat(String(o.price)) || 0;
                if (p <= 0) return o.value;
                return basePrice > 0 ? `${o.value} (+${p.toFixed(2)}€)` : `${o.value} (${p.toFixed(2)}€)`;
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
                const price = parseFloat(String(opt.price)) || 0;
                const finalAmount = basePrice > 0 ? baseAmount + price : price > 0 ? price : baseAmount;
                const selected: OptionSel[] = [{ type: ot.type, value: opt.value, price }];
                closePopup(() =>
                    addProduct({
                        category: item.category,
                        label: product.label,
                        quantity: 1,
                        discount: EmptyDiscount,
                        amount: finalAmount,
                        vatRate: item.rate,
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
                    const extra = selected.reduce((s, o) => s + o.price, 0);
                    addProduct({
                        category: item.category,
                        label: product.label,
                        quantity: 1,
                        discount: EmptyDiscount,
                        amount: baseAmount + extra,
                        vatRate: item.rate,
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
                vatRate: item.rate,
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

    const displayInventory = useMemo(() => {
        const customerCompany = currentCustomer?.company ?? null;
        // Map: category name → company name (for all company-specific categories)
        const categoryCompany = new Map<string, string>();
        for (const c of configCategories ?? []) {
            if (c.company) categoryCompany.set(c.name, c.company);
        }
        // Categories belonging to the selected customer's company
        const customerCategoryNames = new Set(
            [...categoryCompany.entries()].filter(([, comp]) => comp === customerCompany).map(([name]) => name)
        );

        // Inventory is already sorted by dc.categories.sort_order in processData.ts.
        // Don't re-sort by insertion order — just filter products and apply company filtering.
        const withProducts = inventory.map((item) => ({
            ...item,
            products: item.products.filter((p) => p.stock !== 0).sort((a, b) => a.order - b.order),
        }));

        // Company filtering:
        // - Categories with no company → always visible
        // - Categories with a company → only visible if the selected customer belongs to that company
        //   (hidden otherwise, including when no customer is selected)
        const visible = withProducts.filter((item) => {
            const comp = categoryCompany.get(item.category);
            return !comp || comp === customerCompany;
        });

        // When a company customer is selected, move their company-specific categories to the front
        if (customerCompany && customerCategoryNames.size > 0) {
            return [
                ...visible.filter((item) => customerCategoryNames.has(item.category)),
                ...visible.filter((item) => !customerCategoryNames.has(item.category)),
            ];
        }
        return visible;
    }, [inventory, configCategories, currentCustomer]);

    // ── Large-screen UX: catalog mode uses inline grid, not popups ──
    const isMobile = useIsMobile();
    const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
    const categoryBarRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // Track whether the category bar can scroll in either direction
    const updateScrollState = useCallback(() => {
        const el = categoryBarRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 0);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    }, []);

    const scrollCategoryBar = useCallback((direction: 'left' | 'right') => {
        const el = categoryBarRef.current;
        if (!el) return;
        el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
    }, []);

    useEffect(() => {
        if (isMobile || !catalogMode) return;
        if (state !== State.loaded && state !== State.preloaded) return;
        if (!displayInventory.length) return;
        // Ensure selected category index is valid
        if (selectedCategoryIndex >= displayInventory.length) {
            setSelectedCategoryIndex(0);
        }
    }, [state, isMobile, catalogMode, displayInventory, selectedCategoryIndex]);

    const categories = useMemo(() => displayInventory.map(({ category }) => category), [displayInventory]);

    // Update scroll arrows when categories change
    useEffect(() => {
        updateScrollState();
    }, [categories, updateScrollState]);

    // 2 columns per row, all categories shown (scroll if > 3 rows)
    const COLS = 2;
    const rows = Array.from({ length: Math.ceil(categories.length / COLS) }, (_, i) =>
        categories.slice(i * COLS, i * COLS + COLS)
    );
    const ROW_HEIGHT = sizeConfig.rowHeight;
    const MAX_VISIBLE_ROWS = 3;
    const rowClassName = 'flex justify-evenly divide-x divide-active-light dark:divide-active-dark';

    const popupClass = useAddPopupClass(
        catalogMode
            ? 'inset-x-0 relative shrink-0 overflow-hidden'
            : 'inset-x-0 border-t-[3px] absolute bottom-0 md:w-1/2 border-active-light dark:border-active-dark overflow-hidden'
    );

    if (state !== State.loaded && state !== State.preloaded) {
        return null;
    }

    // ── Catalog mode: horizontal categories + 6×6 product grid ──
    if (catalogMode) {
        const selectedItem = displayInventory[selectedCategoryIndex] ?? displayInventory[0];
        const products = selectedItem?.products ?? [];
        const GRID_COLS = 6;
        const GRID_ROWS = 6;
        const MAX_PRODUCTS = GRID_COLS * GRID_ROWS;

        // Build a 6×6 grid positioned by sortOrder encoding:
        // hundreds = category (ignored), tens = row (1-6), units = column (1-6)
        const gridSlots: ((typeof products)[number] | null)[] = new Array(MAX_PRODUCTS).fill(null);
        let fallbackIndex = 0;
        for (const product of products) {
            const so = product.sortOrder ?? 0;
            const row = Math.floor(so / 10) % 10;
            const col = so % 10;
            if (row >= 1 && row <= GRID_ROWS && col >= 1 && col <= GRID_COLS) {
                const slotIndex = (row - 1) * GRID_COLS + (col - 1);
                if (!gridSlots[slotIndex]) {
                    gridSlots[slotIndex] = product;
                    continue;
                }
            }
            // Fallback: place in next available slot
            while (fallbackIndex < MAX_PRODUCTS && gridSlots[fallbackIndex]) fallbackIndex++;
            if (fallbackIndex < MAX_PRODUCTS) {
                gridSlots[fallbackIndex] = product;
                fallbackIndex++;
            }
        }

        return (
            <div className={popupClass + ' flex flex-col'}>
                {/* Horizontal category bar with arrow navigation */}
                <div className="flex items-center border-b-[3px] border-active-light dark:border-active-dark shrink-0">
                    {canScrollLeft && (
                        <button
                            type="button"
                            onClick={() => scrollCategoryBar('left')}
                            className="shrink-0 p-1 hover:bg-active-light dark:hover:bg-active-dark text-light dark:text-dark"
                        >
                            <IconChevronLeft size={24} />
                        </button>
                    )}
                    <div
                        ref={categoryBarRef}
                        onScroll={updateScrollState}
                        className="flex overflow-x-auto border-none scrollbar-none"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {categories.map((category, index) => (
                            <div
                                key={index}
                                className={twMerge(
                                    'flex-1 min-w-fit px-4 py-2 font-semibold text-lg text-center cursor-pointer whitespace-nowrap',
                                    'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark dark:active:text-popup-light',
                                    'hover:bg-active-light dark:hover:bg-active-dark',
                                    index === selectedCategoryIndex
                                        ? 'bg-active-light dark:bg-active-dark text-popup-dark dark:text-popup-light'
                                        : ''
                                )}
                                onClick={() => setSelectedCategoryIndex(index)}
                            >
                                {category}
                            </div>
                        ))}
                    </div>
                    {canScrollRight && (
                        <button
                            type="button"
                            onClick={() => scrollCategoryBar('right')}
                            className="shrink-0 p-1 hover:bg-active-light dark:hover:bg-active-dark text-light dark:text-dark"
                        >
                            <IconChevronRight size={24} />
                        </button>
                    )}
                </div>

                {/* 6×6 product grid — positioned by sortOrder, show price + color */}
                <div className="grid grid-cols-6 auto-rows-20 gap-1 p-1 overflow-y-auto">
                    {gridSlots.map((product, index) => {
                        if (!product) {
                            return <div key={index} className="h-20" />;
                        }
                        const hasOptions = product.options && !isSingleElementFormula(product.options);
                        const bgColor = colorToHex(product.color);
                        const price = product.prices[currencyIndex] ?? product.prices[0] ?? 0;
                        return (
                            <div
                                key={index}
                                className={twMerge(
                                    'relative h-20 flex flex-col text-center font-semibold text-base border-[3px] rounded-2xl select-none',
                                    'border-secondary-light dark:border-secondary-dark shadow-xl cursor-pointer',
                                    bgColor
                                        ? 'text-black dark:text-white'
                                        : 'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark dark:active:text-popup-light hover:bg-active-light dark:hover:bg-active-dark'
                                )}
                                style={bgColor ? { backgroundColor: bgColor } : undefined}
                                onClick={() => {
                                    if (hasOptions) {
                                        openProductListPopup(selectedItem);
                                    } else {
                                        handleProductSelection(selectedItem, product.label);
                                    }
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    onInput(selectedItem.category, 'contextmenu');
                                }}
                            >
                                <div
                                    className="h-15 flex items-center justify-center line-clamp-3 leading-tight hyphens-auto text-center"
                                    lang="fr"
                                >
                                    {product.label}
                                    {Boolean(hasOptions) && <span className="text-xs opacity-70"> ▸</span>}
                                </div>
                                {price > 0 && (
                                    <div className="h-5 flex items-center justify-end text-sm font-normal leading-none pr-2">
                                        {toCurrency(price)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className={popupClass}>
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
                                sizeConfig={sizeConfig}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};
