import { FC } from 'react';

export enum Thickness {
    Thin = 'thin',
    Thick = 'thick',
    Medium = 'medium',
}

export interface SeparatorProps {
    color?: string;
    thickness?: Thickness;
}

export const Separator: FC<SeparatorProps> = ({ color = 'border-orange-300', thickness = Thickness.Thin }) => {
    return <hr className={color} style={{ borderWidth: thickness }} />;
};
