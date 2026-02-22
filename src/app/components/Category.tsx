'use client';

import { FC, MouseEventHandler, useEffect, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { sendFatalErrorEmail } from '../actions/email';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { useWindowParam } from '../hooks/useWindowParam';
import Loading, { LoadingType } from '../loading';
import { EMAIL, OTHER_KEYWORD } from '../utils/constants';
import { isMobileDevice } from '../utils/mobile';
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

    const onClick: MouseEventHandler = (e) => {
        e.preventDefault();

        onInput(input, e.type);
    };

    return (
        <div
            className={twMerge(
                { 1: 'w-full', 2: 'w-1/2', 3: 'w-1/3' }[length] ?? 'w-auto',
                'relative flex justify-center py-3 items-center font-semibold text-2xl',
                'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark dark:active:text-popup-light',
                !isMobileDevice() ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : '',
                selectedProduct?.category === input
                    ? 'bg-active-light dark:bg-active-dark text-popup-dark dark:text-popup-light'
                    : ''
            )}
            onClick={onClick}
            onContextMenu={onClick}
        >
            <div className="line-clamp-2 leading-tight text-center break-words px-1">{input}</div>
        </div>
    );
};

export const Category: FC = () => {
    const { inventory, state, setState, currencyIndex, parameters } = useConfig();
    const { addProduct, amount, setSelectedProduct, clearAmount, clearTotal, selectedProduct, setOrderId, setShortNumOrder } = useData();
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
        if (idx >= optionTypes.length) { onDone(selected); return; }
        const ot = optionTypes[idx];
        const choices = ot.options.map((o) => {
            const p = parseFloat(String(o.prix)) || 0;
            return p > 0 ? `${o.valeur} (+${p.toFixed(2)}€)` : o.valeur;
        });
        choices.push('Passer');
        openPopup(
            ot.type,
            choices,
            (i) => {
                if (i < 0) return; // X button → abort chain
                const next = [...selected];
                if (i < ot.options.length) { // not "Passer"
                    const opt = ot.options[i];
                    const prix = parseFloat(String(opt.prix)) || 0;
                    next.push({ type: ot.type, valeur: opt.valeur, prix });
                }
                selectOptionsChain(optionTypes, next, idx + 1, onDone);
            }
        );
    };

    // ── Formula wizard: one popup per element slot ──
    const selectFormulaElements = (
        formula: CatalogFormula,
        elemIdx: number,
        elements: OptionSel[],
        extraAmount: number,
        onDone: (elements: OptionSel[], extra: number) => void
    ) => {
        if (elemIdx >= formula.elements.length) { onDone(elements, extraAmount); return; }
        const elem = formula.elements[elemIdx];
        openPopup(
            `${elem.nom} (${elemIdx + 1}/${formula.elements.length})`,
            elem.articles.map((a) => a.nom),
            (i) => {
                if (i < 0) return; // X button → abort
                const art = elem.articles[i];
                const afterOptions = (optSel: OptionSel[]) => {
                    const extra = optSel.reduce((s, o) => s + o.prix, 0);
                    const optStr = optSel.length > 0
                        ? ` [${optSel.map((o) => o.prix > 0 ? `${o.valeur} (+${o.prix.toFixed(2)}€)` : o.valeur).join(', ')}]`
                        : '';
                    selectFormulaElements(
                        formula, elemIdx + 1,
                        [...elements, { type: 'element', valeur: `${art.nom}${optStr}`, prix: 0 }],
                        extraAmount + extra,
                        onDone
                    );
                };
                if (art.options) {
                    try {
                        const ots: OptionDef[] = JSON.parse(art.options);
                        if (ots.length > 0) { selectOptionsChain(ots, [], 0, afterOptions); return; }
                    } catch { /* ignore */ }
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
                                doAdd(selected.reduce((s, o) => s + o.prix, 0), selected)
                            );
                            return;
                        }
                    } catch { /* ignore */ }
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
            handleProductSelection(item, item.products[0].label);
            return;
        }

        setSelectedProduct({
            category: item.category,
            label: OTHER_KEYWORD,
            quantity: 0,
            discount: EmptyDiscount,
            amount: 0,
        });
        openPopup(
            item.category,
            item.products
                .map(({ label }) => label)
                .sort((a, b) => a.localeCompare(b))
                .concat('', OTHER_KEYWORD),
            (index, option) => {
                if (index < 0) {
                    setSelectedProduct(undefined);
                    clearAmount();
                    return;
                }
                handleProductSelection(item, option);
            }
        );
    };

    const categories = useMemo(() => inventory.map(({ category }) => category), [inventory]);

    // 2 columns per row, up to 8 slots (last slot becomes OTHER if categories > 8)
    const COLS = 2;
    const MAX_SLOTS = 8;
    const slots = categories.length <= MAX_SLOTS
        ? categories
        : [...categories.slice(0, MAX_SLOTS - 1), OTHER_KEYWORD];
    const rows = Array.from({ length: Math.ceil(slots.length / COLS) }, (_, i) =>
        slots.slice(i * COLS, i * COLS + COLS)
    );
    // Approximate row height for the loading placeholder
    const gridHeight = rows.length * 57;

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
                <div className="divide-y divide-active-light dark:divide-active-dark">
                    {rows.map((row, rowIdx) => (
                        <div key={rowIdx} className={rowClassName}>
                            {row.map((category, colIdx) => (
                                <CategoryButton
                                    key={colIdx}
                                    input={category}
                                    onInput={onInput}
                                    length={row.length}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
