'use client';

import { useState, useEffect } from 'react';
import { useConfig } from '@/app/hooks/useConfig';
import { Parameters } from '@/app/contexts/ConfigProvider';
import SectionCard from '@/app/components/admin/SectionCard';
import ValidatedInput from '@/app/components/admin/ValidatedInput';
import { Mercurial } from '@/app/utils/interfaces';
import { defaultParameters } from '@/app/utils/processData';
import { USE_DIGICARTE } from '@/app/utils/constants';
import AdminPageLayout from '@/app/components/admin/AdminPageLayout';
import AdminLabel from '@/app/components/admin/AdminLabel';

export default function SettingsPage() {
    const { parameters } = useConfig();
    const [settings, setSettings] = useState<Parameters>(defaultParameters);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isReadOnly, setIsReadOnly] = useState(true);
    const [dbConfigChecked, setDbConfigChecked] = useState(false);

    // Step 1: check DB config once on mount
    useEffect(() => {
        fetch('/api/sql/getDbConfig')
            .then((r) => r.json())
            .then(({ hasDbConfig }) => {
                setIsReadOnly(!hasDbConfig);
                setDbConfigChecked(true);
            })
            .catch(() => {
                setIsReadOnly(true);
                setDbConfigChecked(true);
            });
    }, []);

    // Step 2: once DB config is known, load data
    useEffect(() => {
        if (!dbConfigChecked) return;

        const fetchParameters = async () => {
            try {
                if (isReadOnly) {
                    // No DB — use spreadsheet data from useConfig
                    // Wait until at least one meaningful field has loaded
                    if (parameters?.lastModified) {
                        setSettings(parameters);
                    }
                    setIsLoading(false);
                    return;
                }

                const response = await fetch('/api/sql/getParameters');
                const data = await response.json();

                if (data.values && data.values.length > 0) {
                    const paramMap = new Map<string, string>();
                    data.values.forEach(([key, value]: [string, string]) => {
                        paramMap.set(key, value);
                    });

                    const loadedSettings: Parameters = {
                        shop: {
                            name: paramMap.get('name') || '',
                            address: paramMap.get('address') || '',
                            zipCode: paramMap.get('zipCode') || '',
                            city: paramMap.get('city') || '',
                            serial: paramMap.get('serial') || '',
                            id: paramMap.get('id') || '',
                            email: paramMap.get('email') || '',
                        },
                        thanksMessage: paramMap.get('thanksMessage') || 'Merci de votre visite !',
                        mercurial: (paramMap.get('mercurial') || Mercurial.none) as Mercurial,
                        closingHour: Math.max(0, Math.min(23, Number(paramMap.get('closingHour')) || 0)),
                        yearStartDate: (() => {
                            try {
                                const value = paramMap.get('yearStartDate');
                                if (value) {
                                    const parsed = JSON.parse(value);
                                    if (parsed && typeof parsed.month === 'number' && typeof parsed.day === 'number') {
                                        return parsed;
                                    }
                                }
                            } catch {
                                // Invalid JSON, use default
                            }
                            return { month: 1, day: 1 };
                        })(),
                        lastModified: paramMap.get('lastModified') || new Date().toLocaleString(),
                        user: parameters?.user || { name: '', role: 0 },
                    };

                    setSettings(loadedSettings);
                }
            } catch (error) {
                console.error('Error fetching parameters:', error);
                if (parameters) setSettings(parameters);
            } finally {
                setIsLoading(false);
            }
        };

        fetchParameters();
    }, [dbConfigChecked, isReadOnly, parameters]);

    const handleChange = (field: keyof Parameters, value: string | number) => {
        setSettings((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleShopChange = (field: string, value: string) => {
        setSettings((prev) => ({
            ...prev,
            shop: {
                ...prev.shop,
                [field]: value,
            },
        }));
    };

    const handleYearStartDateChange = (field: 'month' | 'day', value: number) => {
        setSettings((prev) => ({
            ...prev,
            yearStartDate: {
                month: field === 'month' ? value : prev.yearStartDate?.month || 1,
                day: field === 'day' ? value : prev.yearStartDate?.day || 1,
            },
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Save each parameter to the database
            const paramUpdates = [
                { key: 'name', value: settings.shop.name },
                { key: 'address', value: settings.shop.address },
                { key: 'zipCode', value: settings.shop.zipCode },
                { key: 'city', value: settings.shop.city },
                { key: 'serial', value: settings.shop.serial },
                { key: 'id', value: settings.shop.id },
                { key: 'email', value: settings.shop.email },
                { key: 'thanksMessage', value: settings.thanksMessage },
                { key: 'mercurial', value: settings.mercurial },
                { key: 'closingHour', value: String(settings.closingHour) },
                { key: 'yearStartDate', value: JSON.stringify(settings.yearStartDate) },
                { key: 'lastModified', value: new Date().toLocaleString() },
            ];

            // Send updates to API (you'll need to create an update endpoint)
            const response = await fetch('/api/sql/updateParameters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parameters: paramUpdates }),
            });

            if (!response.ok) {
                throw new Error('Failed to save parameters');
            }

            alert('Paramètres enregistrés avec succès !');
            window.location.reload();
        } catch (error) {
            console.error("Erreur lors de l'enregistrement:", error);
            alert("Erreur lors de l'enregistrement des paramètres.");
        } finally {
            setIsSaving(false);
        }
    };

    // Redirect if using Digicarte
    if (USE_DIGICARTE) return null;

    if (isLoading) {
        return (
            <AdminPageLayout title="Configuration">
                <p>Chargement...</p>
            </AdminPageLayout>
        );
    }

    if (!settings || !settings.shop) {
        return (
            <AdminPageLayout title="Configuration">
                <p>Erreur de chargement des données</p>
            </AdminPageLayout>
        );
    }

    return (
        <AdminPageLayout title="Configuration">
            {isReadOnly && (
                <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-600 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>Mode lecture seule :</strong> La base de données n'est pas configurée. Les modifications
                        ne seront pas enregistrées.
                    </p>
                </div>
            )}

            <SectionCard title="Informations du commerce" onSave={isReadOnly ? undefined : handleSave}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <AdminLabel>Nom du commerce</AdminLabel>
                        <ValidatedInput
                            value={String(settings.shop.name || '')}
                            onChange={(value) => !isReadOnly && handleShopChange('name', String(value))}
                            placeholder="Nom du commerce"
                        />
                    </div>
                    <div>
                        <AdminLabel>Email</AdminLabel>
                        <ValidatedInput
                            value={String(settings.shop.email || '')}
                            onChange={(value) => !isReadOnly && handleShopChange('email', String(value))}
                            placeholder="Email"
                        />
                    </div>
                    <div>
                        <AdminLabel>Adresse</AdminLabel>
                        <ValidatedInput
                            value={String(settings.shop.address || '')}
                            onChange={(value) => !isReadOnly && handleShopChange('address', String(value))}
                            placeholder="Adresse"
                        />
                    </div>
                    <div>
                        <AdminLabel>Code postal</AdminLabel>
                        <ValidatedInput
                            value={String(settings.shop.zipCode || '')}
                            onChange={(value) => !isReadOnly && handleShopChange('zipCode', String(value))}
                            placeholder="Code postal"
                        />
                    </div>
                    <div>
                        <AdminLabel>Ville</AdminLabel>
                        <ValidatedInput
                            value={String(settings.shop.city || '')}
                            onChange={(value) => !isReadOnly && handleShopChange('city', String(value))}
                            placeholder="Ville"
                        />
                    </div>
                    <div>
                        <AdminLabel>SIRET</AdminLabel>
                        <ValidatedInput
                            value={String(settings.shop.serial || '')}
                            onChange={(value) => !isReadOnly && handleShopChange('serial', String(value))}
                            placeholder="SIRET"
                        />
                    </div>
                    <div>
                        <AdminLabel>ID</AdminLabel>
                        <ValidatedInput
                            value={String(settings.shop.id || '')}
                            onChange={(value) => !isReadOnly && handleShopChange('id', String(value))}
                            placeholder="ID"
                        />
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="Paramètres généraux" onSave={isReadOnly ? undefined : handleSave}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <AdminLabel>Message de remerciement</AdminLabel>
                        <ValidatedInput
                            value={settings.thanksMessage || ''}
                            onChange={(value) => !isReadOnly && handleChange('thanksMessage', String(value))}
                            placeholder="Message de remerciement"
                        />
                    </div>
                    <div>
                        <AdminLabel>Mercurial</AdminLabel>
                        <select
                            value={settings.mercurial}
                            onChange={(e) => !isReadOnly && handleChange('mercurial', e.target.value as Mercurial)}
                            disabled={isReadOnly}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <option value={Mercurial.none}>Aucun</option>
                            <option value={Mercurial.exponential}>Exponentielle</option>
                            <option value={Mercurial.soft}>Douce</option>
                            <option value={Mercurial.zelet}>Zelet</option>
                        </select>
                    </div>
                    <div>
                        <AdminLabel>Heure de clôture (0-23)</AdminLabel>
                        <ValidatedInput
                            type="number"
                            value={String(settings.closingHour)}
                            onChange={(value) =>
                                !isReadOnly && handleChange('closingHour', Math.max(0, Math.min(23, Number(value))))
                            }
                            placeholder="Heure de fermeture"
                        />
                    </div>
                    <div>
                        <AdminLabel>Début d'année fiscale - Mois (1-12)</AdminLabel>
                        <ValidatedInput
                            type="number"
                            value={String(settings.yearStartDate?.month || 1)}
                            onChange={(value) => !isReadOnly && handleYearStartDateChange('month', Number(value))}
                            placeholder="Mois"
                        />
                    </div>
                    <div>
                        <AdminLabel>Début d'année fiscale - Jour (1-31)</AdminLabel>
                        <ValidatedInput
                            type="number"
                            value={String(settings.yearStartDate?.day || 1)}
                            onChange={(value) => !isReadOnly && handleYearStartDateChange('day', Number(value))}
                            placeholder="Jour"
                        />
                    </div>
                </div>
            </SectionCard>

            {!isReadOnly && (
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-active-light dark:bg-active-dark hover:opacity-80 text-popup-light dark:text-popup-dark font-bold py-2 px-6 rounded-md transition disabled:opacity-50"
                    >
                        {isSaving ? 'Enregistrement...' : 'Enregistrer tous les paramètres'}
                    </button>
                </div>
            )}
        </AdminPageLayout>
    );
}
