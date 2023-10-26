'use client';

import { FC, MouseEventHandler, useCallback, useEffect, useMemo, useState } from 'react';
import { State, useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import Loading, { LoadingType } from '../loading';
import { EMAIL, OTHER_KEYWORD } from '../utils/constants';
import { requestFullscreen } from '../utils/fullscreen';
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

    const onClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            requestFullscreen();

            onInput(input, e.type);
        },
        [input, onInput]
    );

    const width = length === 1 ? 'w-full' : length === 2 ? 'w-1/2' : 'w-1/3';

    return (
        <div
            className={
                'relative flex justify-center py-3 items-center font-semibold text-2xl truncate ' +
                'active:bg-active-light active:dark:bg-active-dark active:text-popup-dark active:dark:text-popup-light ' +
                width +
                (selectedProduct?.category === input
                    ? ' bg-active-light dark:bg-active-dark text-popup-dark dark:text-popup-light'
                    : '')
            }
            onClick={onClick}
            onContextMenu={onClick}
        >
            {input.slice(0, 30 / length)}
        </div>
    );
};

export const Category: FC = () => {
    const { inventory, state, lastModified, setState, currencyIndex, shopEmail } = useConfig();
    const { addProduct, amount, setAmount, setSelectedProduct, setQuantity, clearAmount, products } = useData();
    const { openPopup, openFullscreenPopup, closePopup } = usePopup();

    const [hasSentEmail, setHasSentEmail] = useState(false);

    useEffect(() => {
        switch (state) {
            case State.error:
                openFullscreenPopup(
                    'Erreur chargement données',
                    [`Utiliser sauvegarde du ${lastModified}`, 'Réessayer'],
                    (index) => {
                        setState(index === 1 ? State.init : State.done);
                    }
                );
                break;
            case State.unidentified:
                openFullscreenPopup(
                    'Utilisateur non identifié',
                    ['Rafraîchir la page'].concat(!hasSentEmail ? ['Contacter ' + shopEmail] : []),
                    (i) => {
                        if (i === 1) {
                            sendEmail(
                                shopEmail,
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
                            sendEmail(EMAIL, 'Erreur fatale', 'Une erreur de chargement de données est survenue !');
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
    }, [state, openFullscreenPopup, closePopup, lastModified, setState, shopEmail, hasSentEmail]);

    const onInput = useCallback(
        (input: string, eventType: string) => {
            const item =
                inventory.find(({ category }) => category === input) ??
                inventory.find(({ products }) => products.some(({ label }) => label === input));
            if (!item) return;

            if (eventType === 'contextmenu' && amount) {
                addProduct({
                    category: item.category,
                    label: OTHER_KEYWORD,
                    quantity: 1,
                    amount: amount,
                });
            } else {
                setSelectedProduct({ category: item.category, label: OTHER_KEYWORD, quantity: 0, amount: 0 });
                openPopup(
                    item.category,
                    item.products
                        .map(({ label }) => label.charAt(0).toUpperCase() + label.slice(1))
                        .sort((a, b) => a.localeCompare(b))
                        .concat('', OTHER_KEYWORD),
                    (index, option) => {
                        if (index < 0) {
                            setSelectedProduct(undefined);
                            clearAmount();
                            return;
                        }

                        const isNewPrice = amount && amount !== products.current.at(0)?.amount;
                        const price = item.products.find(({ label }) => label === option)?.prices[currencyIndex];
                        if (price || isNewPrice) {
                            const a = isNewPrice ? amount : price || 0;
                            addProduct({
                                category: item.category,
                                label: option,
                                quantity: 1,
                                amount: a,
                            });

                            setAmount(a);
                            setQuantity(-1); // Set the multiplier to 1 (ready for the next input)
                        } else {
                            clearAmount();
                            setSelectedProduct({
                                category: item.category,
                                label: option,
                                quantity: 1,
                                amount: 0,
                            });
                        }
                    }
                );
            }
        },
        [
            openPopup,
            amount,
            setAmount,
            setQuantity,
            inventory,
            currencyIndex,
            addProduct,
            clearAmount,
            setSelectedProduct,
            products,
        ]
    );

    const categories = useMemo(() => inventory.map(({ category }) => category), [inventory]);

    const row1Slice = categories.length <= 2 ? 1 : categories.length >= 3 && categories.length <= 4 ? 2 : 3;
    const row2Slice =
        categories.length >= 2 && categories.length <= 3 ? 1 : categories.length >= 4 && categories.length <= 5 ? 2 : 3;

    const rowClassName = 'flex justify-evenly divide-x divide-active-light dark:divide-active-dark';

    return (
        <div
            className={useAddPopupClass(
                'inset-x-0 border-t-[3px] absolute bottom-0 md:w-1/2 border-active-light dark:border-active-dark'
            )}
        >
            {(state === State.init || state === State.loading || state === State.error) && (
                <div className="h-[113px] flex items-center justify-center">{Loading(LoadingType.Dot, false)}</div>
            )}
            {state === State.done && (
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
