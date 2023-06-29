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
    const { popupTitle, popupOptions, popupAction, closePopup } = usePopup();

    return (
        // <div className={removePopupClass('z-20 opacity-50 bg-gray-900 h-screen w-screen grid absolute')}>
        <div
            className={removePopupClass(
                'z-30 w-5/6 absolute opacity-100 brightness-100 justify-self-center bg-slate-100 h-fit rounded-2xl self-center blur-none border-black'
            )}
            style={{ borderWidth: 'medium' }}
        >
            <div className="flex justify-between">
                <div className="text-2xl truncate font-semibold p-3">{popupTitle}</div>
                <CloseButton onClose={closePopup} />
            </div>
            <Separator />
            {popupOptions.map((option, index) =>
                option ? (
                    <div
                        className="active:bg-lime-300 w-full relative flex justify-center py-3 items-center font-semibold text-xl text-center"
                        key={index}
                        onClick={() => {
                            popupAction(option);
                            closePopup();
                        }}
                    >
                        {option}
                    </div>
                ) : (
                    <Separator key={index} color="border-lime-300" />
                )
            )}
        </div>
        // </div>
    );
};
