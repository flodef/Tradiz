'use client';

import { Parameters, ProductsSettings, SearchSettings, DisplaySettings } from '@/app/contexts/ConfigProvider';
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_PRODUCTS_SETTINGS } from '@/app/utils/processData';
import { adminTextStyle } from '@/app/utils/constants';
import { frenchPhoneRegex } from '@/app/utils/regex';
import { Mercurial, User } from '@/app/utils/interfaces';
import AdminInput from '../AdminInput';
import AdminButton from '../AdminButton';
import AdminSelect from '../AdminSelect';
import SectionCard from '../SectionCard';
import Switch from '../Switch';
import SiretInput from '../SiretInput';
import ValidatedInput from '../ValidatedInput';
import ZipCityRow from '../ZipCityRow';
import { useEffect, useState } from 'react';
import { IconCheck, IconX, IconShieldCheck, IconArchive, IconCertificate } from '@tabler/icons-react';
import { usePopup } from '@/app/hooks/usePopup';

interface ParametersConfigProps {
    config: Parameters;
    users: User[];
    onChange: (data: Parameters) => void;
    onSave?: (data: Parameters) => void;
    onCancel?: () => void;
    hasChanges?: boolean;
    isReadOnly?: boolean;
    isSiretValid?: boolean;
    onSiretValidation?: (isValid: boolean) => void;
    isLoading?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    icon?: React.ReactNode;
}

const MONTH_NAMES = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
];

export default function ParametersConfig({
    config,
    users,
    onChange,
    onSave,
    onCancel,
    hasChanges = false,
    isReadOnly = false,
    isSiretValid = true,
    onSiretValidation,
    isLoading = false,
    isOpen,
    onToggle,
    icon,
}: ParametersConfigProps) {
    const { openPopup } = usePopup();
    const [appVersion, setAppVersion] = useState(process.env.NEXT_PUBLIC_APP_VERSION);
    const [integrityStatus, setIntegrityStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
    const [archiveStatus, setArchiveStatus] = useState<'idle' | 'downloading' | 'done' | 'fail'>('idle');
    const [certStatus, setCertStatus] = useState<'idle' | 'downloading' | 'done' | 'fail'>('idle');

    useEffect(() => {
        // Fetch the current version from package.json at runtime
        fetch('/api/version')
            .then((res) => res.json())
            .then((data) => {
                if (data.version) setAppVersion(data.version);
            })
            .catch(() => {
                // Fallback to env var if API fails
                setAppVersion(process.env.NEXT_PUBLIC_APP_VERSION);
            });
    }, []);

    const downloadFiscalArchive = () => {
        setArchiveStatus('downloading');
        const now = new Date();
        const start = new Date(now.getFullYear() - 10, 0, 1).toISOString().substring(0, 10);
        const end = now.toISOString().substring(0, 10);
        fetch(`/api/sql/fiscalArchive?start_date=${start}&end_date=${end}&requested_by=admin`)
            .then((res) => {
                if (!res.ok) throw new Error('Export failed');
                return res.blob();
            })
            .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `archive_${start}_${end}.json`;
                a.click();
                URL.revokeObjectURL(url);
                setArchiveStatus('done');
            })
            .catch(() => {
                setArchiveStatus('fail');
                setTimeout(() => setArchiveStatus('idle'), 3000);
            });
    };

    const downloadCertificate = () => {
        setCertStatus('downloading');
        fetch('/api/sql/nf525Certificate')
            .then((res) => {
                if (!res.ok) throw new Error('Certificate failed');
                return res.blob();
            })
            .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `certificat_nf525_${new Date().toISOString().substring(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                setCertStatus('done');
            })
            .catch(() => {
                setCertStatus('fail');
                setTimeout(() => setCertStatus('idle'), 3000);
            });
    };

    const checkIntegrity = () => {
        setIntegrityStatus('checking');
        fetch('/api/sql/verifyIntegrity')
            .then((res) => res.json())
            .then((data) => {
                setIntegrityStatus(data.integrity_ok ? 'ok' : 'fail');
                if (!data.integrity_ok && data.issues && data.issues.length > 0) {
                    const issueLines = data.issues
                        .slice(0, 10)
                        .map((i: { transaction_id: number; issue: string }) => `#${i.transaction_id}: ${i.issue}`);
                    const more = data.issues.length > 10 ? `\n... et ${data.issues.length - 10} autre(s)` : '';
                    openPopup("Échec de l'intégrité NF525", [
                        `${data.total_transactions} transactions vérifiées`,
                        `${data.verified} validées`,
                        `${data.issues_found} erreur(s) détectée(s)`,
                        '',
                        ...issueLines,
                        more,
                    ]);
                }
            })
            .catch(() => {
                setIntegrityStatus('fail');
            });
    };

    const maxDaysInMonth = (month: number): number => {
        const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return days[month - 1] ?? 31;
    };

    const handleChange = (field: keyof Parameters, value: unknown) => {
        onChange({
            ...config,
            [field]: value,
        });
    };

    const handleShopChange = (field: string, value: string) => {
        onChange({
            ...config,
            shop: {
                ...config.shop,
                [field]: value,
            },
        });
    };

    const handleYearStartDateChange = (field: 'month' | 'day', value: number) => {
        const currentMonth = config.yearStartDate?.month || 1;
        const currentDay = config.yearStartDate?.day || 1;
        if (field === 'month') {
            const newMonth = Math.max(1, Math.min(12, value));
            const maxDay = maxDaysInMonth(newMonth);
            onChange({
                ...config,
                yearStartDate: { month: newMonth, day: Math.min(currentDay, maxDay) },
            });
        } else {
            const maxDay = maxDaysInMonth(currentMonth);
            onChange({
                ...config,
                yearStartDate: { month: currentMonth, day: Math.max(1, Math.min(maxDay, value)) },
            });
        }
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
            saveDisabled={!isSiretValid}
            isLoading={isLoading}
            isOpen={isOpen}
            isReadOnly={isReadOnly}
            onToggle={onToggle}
            isValid={isSiretValid}
            addLabel=""
        >
            {/* Subsection: Commerce */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Commerce
                </h3>
                <div className="flex flex-wrap gap-4">
                    <ValidatedInput
                        label="Nom du commerce"
                        value={String(config.shop.name || '')}
                        onChange={(value) => handleShopChange('name', String(value))}
                        placeholder="Nom du commerce"
                        isReadOnly={isReadOnly}
                        className="flex-1 min-w-40 max-w-xs"
                    />
                    <ValidatedInput
                        label="Email"
                        value={String(config.shop.email || '')}
                        onChange={(value) => handleShopChange('email', String(value))}
                        placeholder="Email"
                        isReadOnly={isReadOnly}
                        className="flex-1 min-w-40 max-w-xs"
                    />
                    <ValidatedInput
                        label="Téléphone"
                        value={String(config.shop.phone || '')}
                        onChange={(value) => handleShopChange('phone', String(value))}
                        placeholder="06 12 34 56 78"
                        isReadOnly={isReadOnly}
                        className="flex-1 w-28"
                        validation={(value) => {
                            const v = String(value).trim();
                            return v === '' || frenchPhoneRegex.test(v);
                        }}
                    />
                    <SiretInput
                        value={String(config.shop.serial || '')}
                        onChange={(value: string) => handleShopChange('serial', value)}
                        onValidation={onSiretValidation}
                        isReadOnly={isReadOnly}
                    />
                    <ValidatedInput
                        label="N° TVA intracom"
                        value={String(config.shop.vatNumber || '')}
                        onChange={(value) => handleShopChange('vatNumber', String(value))}
                        placeholder="FR12345678901"
                        isReadOnly={isReadOnly}
                        className="flex-1 w-30"
                    />
                    <div className="w-full flex flex-wrap gap-4 items-end">
                        <ValidatedInput
                            label="Adresse"
                            value={String(config.shop.address || '')}
                            onChange={(value) => handleShopChange('address', String(value))}
                            placeholder="Adresse"
                            isReadOnly={isReadOnly}
                            className="flex-1 min-w-40 max-w-xs"
                        />
                        <ZipCityRow
                            zipCode={String(config.shop.zipCode || '')}
                            city={String(config.shop.city || '')}
                            onZipChange={(value: string) => handleShopChange('zipCode', value)}
                            onCityChange={(value: string) => handleShopChange('city', value)}
                            isReadOnly={isReadOnly}
                        />
                    </div>
                </div>
            </div>

            {/* Subsection: Général */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Général
                </h3>
                <div className="flex flex-wrap gap-4 items-end">
                    <AdminInput
                        label="Heure de clôture"
                        type="number"
                        min={0}
                        max={23}
                        value={config.closingHour}
                        onChange={(e) =>
                            !isReadOnly &&
                            handleChange('closingHour', Math.max(0, Math.min(23, Number(e.target.value))))
                        }
                        isReadOnly={isReadOnly}
                        className="w-30"
                    />
                    <div className="flex flex-col">
                        <label className={adminTextStyle}>Début d&apos;année fiscale</label>
                        <div className="flex gap-2">
                            <AdminInput
                                type="number"
                                min={1}
                                max={maxDaysInMonth(config.yearStartDate?.month || 1)}
                                value={config.yearStartDate?.day || 1}
                                isReadOnly={isReadOnly}
                                onChange={(e) => handleYearStartDateChange('day', Number(e.target.value))}
                                className="w-14"
                                placeholder="Jour"
                            />
                            <AdminSelect
                                value={config.yearStartDate?.month || 1}
                                onChange={(e) => handleYearStartDateChange('month', Number(e.target.value))}
                                className="w-28"
                                options={MONTH_NAMES.map((name, i) => ({ label: name, value: i + 1 }))}
                                isReadOnly={isReadOnly}
                            />
                        </div>
                    </div>
                    <ValidatedInput
                        label="Taux de fidélité (%)"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={config.fidelityRate ?? 0}
                        onChange={(value) =>
                            !isReadOnly && handleChange('fidelityRate', Math.max(0, Math.min(100, Number(value) || 0)))
                        }
                        isReadOnly={isReadOnly}
                        className="w-32"
                    />
                    <ValidatedInput
                        label="Message de remerciement"
                        value={config.thanksMessage || ''}
                        onChange={(value) => handleChange('thanksMessage', String(value))}
                        placeholder="Message de remerciement"
                        isReadOnly={isReadOnly}
                        className="max-w-xs min-w-40 flex-1"
                    />
                    <AdminSelect
                        label="Mercurial"
                        value={config.mercurial}
                        onChange={(e) => !isReadOnly && handleChange('mercurial', e.target.value as Mercurial)}
                        className="w-32"
                        options={[
                            { label: 'Aucun', value: Mercurial.none },
                            { label: 'Exponentielle', value: Mercurial.exponential },
                            { label: 'Douce', value: Mercurial.soft },
                            { label: 'Zelet', value: Mercurial.zelet },
                        ]}
                        isReadOnly={isReadOnly}
                    />
                    {appVersion && (
                        <ValidatedInput
                            label="Version"
                            value={appVersion}
                            onChange={() => {}}
                            isReadOnly={true}
                            className="w-32"
                        />
                    )}
                </div>
            </div>

            {/* Subsection: NF525 */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    NF525 — Conformité fiscale
                </h3>
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex flex-col gap-1">
                        <label className={adminTextStyle}>Intégrité</label>
                        <AdminButton
                            variant={
                                integrityStatus === 'ok' ? 'add' : integrityStatus === 'fail' ? 'danger' : 'primary'
                            }
                            onClick={checkIntegrity}
                            disabled={integrityStatus === 'checking'}
                            isLoading={integrityStatus === 'checking'}
                            className="h-8 mt-0"
                        >
                            {integrityStatus === 'ok' ? (
                                <>
                                    <IconCheck size={20} stroke={2} />
                                    Valide
                                </>
                            ) : integrityStatus === 'fail' ? (
                                <>
                                    <IconX size={20} stroke={2} />
                                    Erreur
                                </>
                            ) : (
                                <>
                                    <IconShieldCheck size={18} stroke={2} />
                                    Vérifier
                                </>
                            )}
                        </AdminButton>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className={adminTextStyle}>Archive fiscale</label>
                        <AdminButton
                            variant={archiveStatus === 'done' ? 'add' : archiveStatus === 'fail' ? 'danger' : 'primary'}
                            onClick={downloadFiscalArchive}
                            disabled={archiveStatus === 'downloading'}
                            isLoading={archiveStatus === 'downloading'}
                            className="h-8 mt-0"
                        >
                            {archiveStatus === 'done' ? (
                                <>
                                    <IconCheck size={20} stroke={2} />
                                    Exporté
                                </>
                            ) : archiveStatus === 'fail' ? (
                                <>
                                    <IconX size={20} stroke={2} />
                                    Erreur
                                </>
                            ) : (
                                <>
                                    <IconArchive size={18} stroke={2} />
                                    Exporter
                                </>
                            )}
                        </AdminButton>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className={adminTextStyle}>Certificat</label>
                        <AdminButton
                            variant={certStatus === 'done' ? 'add' : certStatus === 'fail' ? 'danger' : 'primary'}
                            onClick={downloadCertificate}
                            disabled={certStatus === 'downloading'}
                            isLoading={certStatus === 'downloading'}
                            className="h-8 mt-0"
                        >
                            {certStatus === 'done' ? (
                                <>
                                    <IconCheck size={20} stroke={2} />
                                    Téléchargé
                                </>
                            ) : certStatus === 'fail' ? (
                                <>
                                    <IconX size={20} stroke={2} />
                                    Erreur
                                </>
                            ) : (
                                <>
                                    <IconCertificate size={18} stroke={2} />
                                    Télécharger
                                </>
                            )}
                        </AdminButton>
                    </div>
                </div>
            </div>

            {/* Subsection: Facturation électronique */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                    Facturation électronique
                </h3>
                <div className="flex flex-wrap gap-4 items-end">
                    <ValidatedInput
                        label="Token API PennyLane"
                        value={config.pennylaneToken || ''}
                        onChange={(value) => handleChange('pennylaneToken', String(value))}
                        placeholder="Token d'accès PennyLane"
                        isReadOnly={isReadOnly}
                        className="flex-1 min-w-60 max-w-md"
                    />
                </div>
            </div>

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
                            isReadOnly={isReadOnly}
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
                            isReadOnly={isReadOnly}
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
