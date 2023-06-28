import { FC } from 'react';
import { usePopup } from '../hooks/usePopup';
import { CloseButton } from './CloseButton';
import { Separator } from './Separator';

export function addPopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? ' blur-sm pointer-events-none ' : '');
}

function removePopupClass(className: string): string {
    const { isPopupOpen } = usePopup();

    return className + (isPopupOpen ? '' : ' hidden ');
}

export const Popup: FC = () => {
    const { popupOptions, popupAction, closePopup } = usePopup();

    return (
        <div className={removePopupClass('z-20 w-5/6 justify-self-center bg-slate-100 h-fit rounded-2xl')}>
            <div className="flex justify-between">
                <div className="text-2xl truncate font-semibold p-3">Moyen de paiement</div>
                <CloseButton onClose={closePopup} />
            </div>
            <Separator />
            {popupOptions.map((option) => (
                <div
                    className="active:bg-lime-300 w-full relative flex justify-center py-3 items-center font-semibold text-xl text-center"
                    key={option}
                    onClick={() => {
                        popupAction(option);
                        closePopup();
                    }}
                >
                    {option}
                </div>
            ))}
        </div>
    );
};
