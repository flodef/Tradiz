import { FC } from 'react';

export interface SeparatorProps {
    color?: string;
    thickness?: string;
}

export const Separator: FC<SeparatorProps> = ({ color = 'border-orange-300', thickness = 'thin' }) => {
    return <hr className={color} style={{ borderWidth: thickness }} />;
};
