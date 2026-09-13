'use client';

import { Parameters, ProductsSettings, SearchSettings, DisplaySettings } from '@/app/contexts/ConfigProvider';
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_PRODUCTS_SETTINGS } from '@/app/utils/processData';
import { User } from '@/app/utils/interfaces';
import { useSubscription } from '@/app/hooks/useSubscription';
import SectionCard from '../SectionCard';
import Switch from '../Switch';

interface ParametersConfigProps {
    config: Parameters;
    users: User[];
    onChange: (data: Parameters) => void;
    onSave?: (data: Parameters) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}

export default function ParametersConfig({
    config,
    users,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
}: ParametersConfigProps) {
    const { limits } = useSubscription();
    const handleChange = (field: keyof Parameters, value: unknown) => {
        onChange({
            ...config,
            [field]: value,
        });
    };

    const handleDisplayChange = (field: keyof DisplaySettings, checked: boolean) => {
        handleChange('display', {
            ...(config.display ?? DEFAULT_DISPLAY_SETTINGS),
            [field]: checked,
        } as DisplaySettings);
    };

    return (
        <SectionCard
            title="Paramètres"
            onSave={onSave ? () => onSave(config) : undefined}
            onCancel={isReadOnly || !hasChanges ? undefined : onCancel}
            hasChanges={hasChanges}
            onAdd={undefined}
            icon={icon}
            saveDisabled={false}
            isLoading={isLoading}
            isOpen={isOpen}
            isReadOnly={isReadOnly}
            onToggle={onToggle}
            isValid={true}
            addLabel=""
        >
            {/* Subsection: Produits */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Produits
                </h3>
                <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useVatPerProduct ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? DEFAULT_PRODUCTS_SETTINGS),
                                    useVatPerProduct: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                            label="Utiliser TVA par produit"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useReference ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? DEFAULT_PRODUCTS_SETTINGS),
                                    useReference: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                            label="Utiliser référence"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useStock ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? DEFAULT_PRODUCTS_SETTINGS),
                                    useStock: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                            label="Utiliser stock"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.usePhoto ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? DEFAULT_PRODUCTS_SETTINGS),
                                    usePhoto: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                            label="Utiliser photo"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useDescription ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? DEFAULT_PRODUCTS_SETTINGS),
                                    useDescription: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                            label="Utiliser description"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useOptions ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? DEFAULT_PRODUCTS_SETTINGS),
                                    useOptions: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                            label="Utiliser options"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useColor ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? DEFAULT_PRODUCTS_SETTINGS),
                                    useColor: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly}
                            label="Utiliser couleur produit"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.products?.useEmployerShare ?? false}
                            onChange={(checked) =>
                                handleChange('products', {
                                    ...(config.products ?? DEFAULT_PRODUCTS_SETTINGS),
                                    useEmployerShare: checked,
                                } as ProductsSettings)
                            }
                            isReadOnly={isReadOnly || !limits.employerShare}
                            label="Utiliser quote-part"
                        />
                    </div>
                </div>
            </div>

            {/* Subsection: Recherche */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Recherche
                </h3>
                <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.search?.searchCustomers ?? false}
                            onChange={(checked) =>
                                handleChange('search', {
                                    ...(config.search ?? {
                                        searchCustomers: false,
                                        searchProducts: false,
                                        searchUsers: false,
                                    }),
                                    searchCustomers: checked,
                                } as SearchSettings)
                            }
                            isReadOnly={isReadOnly || !limits.customers}
                            label="Clients"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.search?.searchProducts ?? false}
                            onChange={(checked) =>
                                handleChange('search', {
                                    ...(config.search ?? {
                                        searchCustomers: false,
                                        searchProducts: false,
                                        searchUsers: false,
                                    }),
                                    searchProducts: checked,
                                } as SearchSettings)
                            }
                            isReadOnly={isReadOnly}
                            label="Produits"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.search?.searchUsers ?? false}
                            onChange={(checked) =>
                                handleChange('search', {
                                    ...(config.search ?? {
                                        searchCustomers: false,
                                        searchProducts: false,
                                        searchUsers: false,
                                    }),
                                    searchUsers: checked,
                                } as SearchSettings)
                            }
                            isReadOnly={isReadOnly}
                            label="Utilisateurs"
                        />
                    </div>
                </div>
            </div>

            {/* Subsection: Réservation */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Réservation
                </h3>
                <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.reservationPhone ?? false}
                            onChange={(checked) => handleChange('reservationPhone', checked)}
                            isReadOnly={isReadOnly}
                            label="Réserver par téléphone"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.reservationEmail ?? false}
                            onChange={(checked) => handleChange('reservationEmail', checked)}
                            isReadOnly={isReadOnly}
                            label="Réserver par email"
                        />
                    </div>
                </div>
            </div>

            {/* Subsection: Paiements */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Paiements
                </h3>
                <div className="flex flex-wrap gap-6 items-end">
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.showWaiting ?? true}
                            onChange={(checked) => handleDisplayChange('showWaiting', checked)}
                            isReadOnly={isReadOnly}
                            label="Mettre en attente"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.showRefund ?? true}
                            onChange={(checked) => handleDisplayChange('showRefund', checked)}
                            isReadOnly={isReadOnly}
                            label="Remboursement"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.showProvision ?? true}
                            onChange={(checked) => handleDisplayChange('showProvision', checked)}
                            isReadOnly={isReadOnly}
                            label="Provision"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.showDebit ?? true}
                            onChange={(checked) => handleDisplayChange('showDebit', checked)}
                            isReadOnly={isReadOnly}
                            label="Débit"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.showChange ?? true}
                            onChange={(checked) => handleDisplayChange('showChange', checked)}
                            isReadOnly={isReadOnly}
                            label="Calculer et afficher la monnaie"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.useTakeOut ?? true}
                            onChange={(checked) => handleDisplayChange('useTakeOut', checked)}
                            isReadOnly={isReadOnly}
                            label="Sur place / À emporter"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.paymentIconsMode ?? true}
                            onChange={(checked) => handleDisplayChange('paymentIconsMode', checked)}
                            isReadOnly={isReadOnly}
                            label="Icônes de paiement"
                        />
                    </div>
                </div>
            </div>

            {/* Subsection: Autres */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Autres
                </h3>
                <div className="flex flex-wrap gap-6">
                    {users.length > 1 && (
                        <div className="flex items-center gap-3">
                            <Switch
                                checked={config.userSwitch ?? true}
                                onChange={(checked) => handleChange('userSwitch', checked)}
                                isReadOnly={isReadOnly}
                                label="Autoriser le changement d'utilisateur"
                            />
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.catalogMode ?? false}
                            onChange={(checked) => handleDisplayChange('catalogMode', checked)}
                            isReadOnly={isReadOnly}
                            label="Mode catalogue"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.useVirtualKeyboard ?? false}
                            onChange={(checked) => handleChange('useVirtualKeyboard', checked)}
                            isReadOnly={isReadOnly}
                            label="Clavier virtuel"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={config.display?.displayOthers ?? false}
                            onChange={(checked) => handleDisplayChange('displayOthers', checked)}
                            isReadOnly={isReadOnly}
                            label="Afficher 'Autres' dans liste de produits"
                        />
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}
