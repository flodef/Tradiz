import { LabelHTMLAttributes } from 'react';

export default function AdminLabel({ children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
    return (
        <label className="block text-sm font-bold mb-1" {...props}>
            {children}
        </label>
    );
}
