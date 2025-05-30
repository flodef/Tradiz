'use client';

import { FC, MouseEventHandler, useEffect, useMemo, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { EmptyDiscount, InventoryItem, State, useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { useWindowParam } from '../hooks/useWindowParam';
import Loading, { LoadingType } from '../loading';
import { EMAIL, OTHER_KEYWORD } from '../utils/constants';
import { isMobileDevice } from '../utils/mobile';
import { getPublicKey } from '../utils/processData';
import { sendEmail } from '../utils/sendEmail';
import { useAddPopupClass } from './Popup';

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
                'active:bg-secondary-active-light dark:active:bg-secondary-active-dark active:text-popup-dark active:dark:text-popup-light',
                !isMobileDevice() ? 'hover:bg-active-light dark:hover:bg-active-dark cursor-pointer' : '',
                selectedProduct?.category === input
                    ? 'bg-active-light dark:bg-active-dark text-popup-dark dark:text-popup-light'
                    : ''
            )}
            onClick={onClick}
            onContextMenu={onClick}
        >
            <div className="truncate text-clip text-center">{input}</div>
        </div>
    );
};

export const Category: FC = () => {
    const { inventory, state, setState, currencyIndex, parameters } = useConfig();
    const { addProduct, amount, setSelectedProduct, clearAmount, selectedProduct } = useData();
    const { openPopup, openFullscreenPopup, closePopup } = usePopup();
    const { isLocalhost, isDemo } = useWindowParam();

    const [hasSentEmail, setHasSentEmail] = useState(false);

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
                    ['Rafraîchir la page'].concat(!hasSentEmail ? ['Contacter ' + parameters.shop.email] : []),
                    (i) => {
                        if (i === 1) {
                            sendEmail(
                                parameters.shop.email,
                                "Demande d'accès utilisateur",
                                `Bonjour, je souhaite accéder à l'application de caisse avec les informations suivantes : 
                            \n- Clé : ${getPublicKey()} 
                            \n- Nom : (Indiquez votre nom)
                            \n- Rôle : [Caisse / Service / Cuisine] (Gardez celui qui convient)
                            \n\nMerci de me donner les droits d'accès.`
                            );
                            setHasSentEmail(true);
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
                            sendEmail(EMAIL, 'Erreur fatale', "L'erreur suivante est survenue :" + parameters.error);
                            setHasSentEmail(true);
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

    const addSpecificProduct = (item: InventoryItem, option: string) => {
        const price = item.products.find(({ label }) => label === option)?.prices[currencyIndex];
        const isNewPrice = amount && amount !== selectedProduct?.amount;
        addProduct({
            category: item.category,
            label: option,
            quantity: 1,
            discount: EmptyDiscount,
            amount: isNewPrice ? amount : price || 0,
        });
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
        } else if (item.products.length === 1) {
            addSpecificProduct(item, item.products[0].label);
        } else {
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

                    addSpecificProduct(item, option);
                }
            );
        }
    };

    const categories = useMemo(() => inventory.map(({ category }) => category), [inventory]);

    const row1Slice = categories.length <= 2 ? 1 : categories.length >= 3 && categories.length <= 4 ? 2 : 3;
    const row2Slice =
        categories.length >= 2 && categories.length <= 3 ? 1 : categories.length >= 4 && categories.length <= 5 ? 2 : 3;

    const rowClassName = 'flex justify-evenly divide-x divide-active-light dark:divide-active-dark';

    return (
        <div
            className={useAddPopupClass(
                'inset-x-0 border-t-[3px] absolute bottom-0 md:w-1/2 border-active-light dark:border-active-dark overflow-hidden'
            )}
        >
            {(state === State.init || state === State.loading || state === State.error) && (
                <div className="h-[113px] flex items-center justify-center">{Loading(LoadingType.Dot, false)}</div>
            )}
            {(state === State.preloaded || state === State.loaded) && (
                <div className="divide-y divide-active-light dark:divide-active-dark">
                    <div className={rowClassName}>
                        {categories.slice(0, row1Slice).map((category, index) => (
                            <CategoryButton key={index} input={category} onInput={onInput} length={row1Slice} />
                        ))}
                    </div>

                    <div className={rowClassName}>
                        {categories.slice(row1Slice, 6).map((category, index) => (
                            <CategoryButton
                                key={index}
                                input={category === categories[5] && categories.length > 6 ? OTHER_KEYWORD : category}
                                onInput={onInput}
                                length={row2Slice}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
