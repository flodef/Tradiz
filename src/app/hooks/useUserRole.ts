import { useConfig } from './useConfig';
import { Role } from '../utils/interfaces';

export function useUserRole() {
    const { parameters } = useConfig();
    const userRole = parameters?.user?.role || Role.cashier;

    const isAdmin = userRole === Role.admin;
    const isCashier = userRole === Role.cashier || userRole === Role.admin;
    const isService = userRole === Role.service || userRole === Role.admin;
    const isKitchen = userRole === Role.kitchen || userRole === Role.admin;

    return {
        role: userRole,
        isAdmin,
        isCashier,
        isService,
        isKitchen,
    };
}
