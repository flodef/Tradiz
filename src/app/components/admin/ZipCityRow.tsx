'use client';

import { useEffect, useRef, useState } from 'react';
import AdminLabel from './AdminLabel';

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
                // Store uppercase city names for consistent matching
                const names = data.map((c) => toUpper(c.nom));
                setCities(names);
                if (names.length === 1) {
                    // Auto-fill only if empty; update to uppercase if single match
                    onCityChange(names[0]);
                } else if (city) {
                    // Case-insensitive match: normalise existing value to uppercase
                    const matched = names.find((n) => n === toUpper(city));
                    if (matched) onCityChange(matched);
                }
            })
            .catch((e) => {
                if (e.name !== 'AbortError') setCities([]);
            })
            .finally(() => setIsLoadingCities(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zipCode, isOffline]);

    const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (ZIP_REGEX.test(val)) onZipChange(val);
    };

    const isZipValid = zipCode === '' || VALID_ZIP_REGEX.test(zipCode);

    // When showing a select, check whether the current city value matches one of the options
    const showSelect = !isOffline && cities.length > 1;
    const cityMatchesOption = cities.some((c) => c === toUpper(city));
    const selectHasError = showSelect && city !== '' && !cityMatchesOption;

    const baseSelect =
        'min-w-0 px-3 py-2 border rounded-md bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed';
    const baseInput =
        'w-full min-w-0 px-3 py-2 border rounded-md bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed';
    const borderOk = 'border-gray-300 dark:border-gray-600';
    const borderErr = 'border-red-500 dark:border-red-400';

    return (
        <div className="flex gap-3 items-start">
            <div className="flex flex-col gap-1 shrink-0">
                <AdminLabel>CP</AdminLabel>
                <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={zipCode}
                    onChange={handleZipChange}
                    disabled={disabled}
                    placeholder="75001"
                    className={`w-20 px-3 py-2 border rounded-md bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isZipValid ? borderOk : borderErr
                    }`}
                />
            </div>
            <div className="flex flex-col gap-1 min-w-0 w-48">
                <AdminLabel>Ville{isLoadingCities ? ' …' : ''}</AdminLabel>
                {showSelect ? (
                    <select
                        value={toUpper(city)}
                        onChange={(e) => onCityChange(e.target.value)}
                        disabled={disabled}
                        className={`${baseSelect} ${selectHasError ? borderErr : borderOk}`}
                    >
                        <option value="">{city || 'Sélectionner…'}</option>
                        {cities.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input
                        type="text"
                        value={city}
                        onChange={(e) => onCityChange(toUpper(e.target.value))}
                        disabled={disabled}
                        placeholder="Ville"
                        className={`${baseInput} ${borderOk}`}
                    />
                )}
            </div>
        </div>
    );
}
