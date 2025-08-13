import { Parameters } from '@/app/contexts/ConfigProvider';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

export default function SettingsConfig({
    config,
    onChange,
    onSave,
}: {
    config: Parameters;
    onChange: (data: Parameters) => void;
    onSave: (data: Parameters) => void;
}) {
    const settingsFields = {
        'Nom du commerce': 'shopName',
        Adresse: 'address',
        'Code postal': 'zipCode',
        Ville: 'city',
        SIRET: 'siret',
        'Email de contact': 'contactEmail',
        'Message de remerciement': 'thankYouMessage',
        'Dernière modification': 'lastModified',
    };

    return (
        <SectionCard title="Paramètres" onSave={() => onSave(config)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(settingsFields).map(([label, key]) => (
                    <div key={key}>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {label}
                        </label>
                        <ValidatedInput
                            value={config[key as keyof Parameters] as string}
                            onChange={(value) => onChange({ ...config, [key]: value })}
                            placeholder={label}
                        />
                    </div>
                ))}
            </div>
        </SectionCard>
    );
}
