import { IconCheck, IconX } from '@tabler/icons-react';

interface AvailabilityToggleProps {
    availability: boolean;
    isReadOnly: boolean;
    onChange?: (newAvailability: boolean) => void;
}

export default function AvailabilityToggle({ availability, isReadOnly, onChange }: AvailabilityToggleProps) {
    const Icon = availability ? IconCheck : IconX;
    const baseColor = availability ? 'text-green-500' : 'text-red-500';
    const hoverColor = availability ? 'hover:text-green-600' : 'hover:text-red-600';
    const className = isReadOnly ? baseColor : `${baseColor} ${hoverColor}`;

    const iconElement = <Icon className={className} size={28} stroke={3} />;

    const Wrapper = isReadOnly ? 'div' : 'button';
    const wrapperProps = isReadOnly ? {} : { onClick: () => onChange?.(!availability) };

    return (
        <Wrapper {...wrapperProps} className="flex items-center justify-center h-8 w-8">
            {iconElement}
        </Wrapper>
    );
}
