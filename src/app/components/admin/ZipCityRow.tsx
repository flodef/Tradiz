'use client';

import { useEffect, useRef, useState } from 'react';
import AdminInput from './AdminInput';
import AdminSelect from './AdminSelect';

const ZIP_REGEX = /^\d{0,5}$/;
const VALID_ZIP_REGEX = /^\d{5}$/;

interface ZipCityRowProps {
    zipCode: string;
    city: string;
    onZipChange: (value: string) => void;
    onCityChange: (value: string) => void;
    disabled?: boolean;
}

interface GeoApiCity {
    nom: string;
    code: string;
}

const toUpper = (s: string) => s.toUpperCase();

export default function ZipCityRow({ zipCode, city, onZipChange, onCityChange, disabled = false }: ZipCityRowProps) {
    const [cities, setCities] = useState<string[]>([]);
    const [isLoadingCities, setIsLoadingCities] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        setIsOffline(!navigator.onLine);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (!VALID_ZIP_REGEX.test(zipCode) || isOffline) {
            setCities([]);
            return;
        }

        abortRef.current?.abort();
        abortRef.current = new AbortController();
        setIsLoadingCities(true);

        fetch(`https://geo.api.gouv.fr/communes?codePostal=${zipCode}&fields=nom,code&format=json`, {
            signal: abortRef.current.signal,
        })
            .then((r) => r.json())
            .then((data: GeoApiCity[]) => {
                const names = data.map((c) => toUpper(c.nom));
                setCities(names);
                if (names.length === 1) {
                    onCityChange(names[0]);
                } else if (city) {
                    const matched = names.find((n) => n === toUpper(city));
                    if (matched) onCityChange(matched);
                }
            })
            .catch((e) => {
                if (e.name !== 'AbortError') setCities([]);
            })
            .finally(() => setIsLoadingCities(false));
    }, [zipCode, isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (ZIP_REGEX.test(val)) onZipChange(val);
    };

    const isZipValid = zipCode === '' || VALID_ZIP_REGEX.test(zipCode);
    const showSelect = !isOffline && cities.length > 1;
    const cityMatchesOption = cities.some((c) => c === toUpper(city));
    const selectHasError = showSelect && city !== '' && !cityMatchesOption;

    // Filter cities to avoid double entries of the current city
    const filteredCities = cities.filter((c) => c !== toUpper(city));

    return (
        <div className="flex gap-3 items-start">
            <AdminInput
                label="CP"
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={zipCode}
                onChange={handleZipChange}
                disabled={disabled}
                placeholder="75001"
                error={!isZipValid}
                className="w-16"
            />
            <div className="flex flex-col min-w-0 w-52">
                {showSelect ? (
                    <AdminSelect
                        label={`Ville${isLoadingCities ? ' …' : ''}`}
                        value={toUpper(city)}
                        onChange={(e) => onCityChange(e.target.value)}
                        disabled={disabled}
                        error={selectHasError}
                        options={[
                            { label: city || 'Sélectionner…', value: toUpper(city) },
                            ...filteredCities.map((c) => ({ label: c, value: c })),
                        ]}
                        className="w-full"
                    />
                ) : (
                    <AdminInput
                        label={`Ville${isLoadingCities ? ' …' : ''}`}
                        type="text"
                        value={city}
                        onChange={(e) => onCityChange(toUpper(e.target.value))}
                        disabled={disabled}
                        placeholder="Ville"
                        className="w-full"
                    />
                )}
            </div>
        </div>
    );
}
