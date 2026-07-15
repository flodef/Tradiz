'use client';

import AdminPageLayout from '@/app/components/admin/AdminPageLayout';
import CategoriesConfig from '@/app/components/admin/sections/CategoriesConfig';
import OptionsConfig, { ProductOptionGroup } from '@/app/components/admin/sections/OptionsConfig';
import ProductsConfig, { AdminProduct } from '@/app/components/admin/sections/ProductsConfig';
import { Config, ProductsSettings } from '@/app/contexts/ConfigProvider';
import { useConfig } from '@/app/hooks/useConfig';
import { usePopup } from '@/app/hooks/usePopup';
import { useUserRole } from '@/app/hooks/useUserRole';
import { LoadingDot } from '@/app/loading';
import { USE_DIGICARTE } from '@/app/utils/constants';
import { Category, InventoryItem } from '@/app/utils/interfaces';
import { clearLoadDataCache } from '@/app/utils/processData';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconCategory, IconListDetails, IconBox } from '@tabler/icons-react';
import { useSearchParams } from 'next/navigation';

function buildInventoryFromAdminProducts(products: AdminProduct[]): InventoryItem[] {
    const inventory: InventoryItem[] = [];
    const categoryIndex: Record<string, number> = {};

    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const label = (p.name || '').trim();
        const category = (p.category || '').trim();
        if (!label || !category) continue;

        if (categoryIndex[category] === undefined) {
            categoryIndex[category] = inventory.length;
            inventory.push({
                category: category.toFirstUpperCase(),
                rate: p.vat ?? 0,
                order: inventory.length,
                products: [],
            });
        }

        const item = inventory[categoryIndex[category]];
        item.products.push({
            label: label.toFirstUpperCase(),
            prices: p.currencies.map((c) => Number(c)).filter((price) => Number.isFinite(price)),
            options: p.options || null,
            stock: p.stock ?? null,
            order: item.products.length,
            reference: p.reference ? String(p.reference).trim() : null,
        });
    }

    return inventory;
}

export default function EditMenuPage() {
    const {
        inventory,
        currencies,
        parameters,
        setConfig,
        paymentMethods,
        discounts,
        colors,
        printers,
        customers,
        users,
        isStateReady,
    } = useConfig();
    const { isCashier } = useUserRole();
    const { openFullscreenPopup } = usePopup();
    const searchParams = useSearchParams();
    const [products, setProducts] = useState<AdminProduct[]>([]);
    const [originalProducts, setOriginalProducts] = useState<AdminProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isReadOnly, setIsReadOnly] = useState(true);
    const [dbConfigChecked, setDbConfigChecked] = useState(false);
    const [isSavingProducts, setIsSavingProducts] = useState(false);
    const [productsSettings, setProductsSettings] = useState<ProductsSettings | undefined>(parameters?.products);
    const [openSection, setOpenSection] = useState<string | null>('products');
    const [options, setOptions] = useState<ProductOptionGroup[]>([]);
    const [originalOptions, setOriginalOptions] = useState<ProductOptionGroup[]>([]);
    const [hasOptionsChanges, setHasOptionsChanges] = useState(false);
    const [emptyProductsPopupShown, setEmptyProductsPopupShown] = useState(false);
    const dataLoadedRef = useRef(false);

    // If data is already ready from ConfigProvider, skip loading immediately
    useEffect(() => {
        if (isStateReady && inventory?.length && currencies?.length) {
            setIsLoading(false);
        }
    }, [isStateReady, inventory, currencies]);

    // Derive categories from products — categories are local-only, not stored in DB
    // If all products in a category have the same VAT, use it; otherwise null (divers)
    // Products with empty category appear as 'Sans catégorie'
    const categories = useMemo(() => {
        const catVats = new Map<string, Set<number>>();
        for (const p of products) {
            const cat = p.category || 'Sans catégorie';
            if (!catVats.has(cat)) catVats.set(cat, new Set());
            catVats.get(cat)!.add(p.vat ?? 20);
        }
        const result: Category[] = [];
        for (const [label, vats] of catVats) {
            result.push({ label, vat: vats.size === 1 ? [...vats][0] : null });
        }
        return result;
    }, [products]);

    const [localCategoryLabels, setLocalCategoryLabels] = useState<string[]>([]);
    const categoryOptions = useMemo(() => {
        const base = categories.map((c) => c.label);
        const extras = localCategoryLabels.filter((l) => l && !base.includes(l));
        return [...base, ...extras].map((l) => ({ label: l, value: l }));
    }, [categories, localCategoryLabels]);

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

    // Show popup when redirected due to empty products
    useEffect(() => {
        const emptyProducts = searchParams.get('emptyProducts');
        if (emptyProducts === 'true' && !emptyProductsPopupShown && !isLoading) {
            setEmptyProductsPopupShown(true);
            openFullscreenPopup('Votre catalogue de produits est vide.\n\nVeuillez ajouter des produits ci-dessous.', [
                'OK',
            ]);
        }
    }, [searchParams, emptyProductsPopupShown, isLoading, openFullscreenPopup]);

    useEffect(() => {
        const fetchData = async () => {
            if (dataLoadedRef.current) return;

            // If data is already ready from ConfigProvider (cached), load it immediately without showing loading
            if (isStateReady && inventory?.length && currencies?.length) {
                dataLoadedRef.current = true;
                const allProducts: AdminProduct[] = [];

                inventory.forEach((item) => {
                    item.products.forEach((product) => {
                        allProducts.push({
                            name: product.label,
                            category: item.category,
                            stock: product.stock ?? null,
                            currencies: product.prices.map(String),
                            vat: item.rate >= 1 ? item.rate : item.rate * 100,
                        });
                    });
                });

                setProducts(allProducts);
                setOriginalProducts(allProducts);
                setIsLoading(false);

                if (isReadOnly) return;
            } else {
                setIsLoading(true);
            }

            // Wait for DB config check before loading from DB
            if (!dbConfigChecked) return;

            try {
                if (isReadOnly) {
                    // No DB — use spreadsheet data from useConfig
                    if (!inventory?.length || !currencies?.length) {
                        // Wait for inventory/currencies to load - will re-run when they change
                        return;
                    }
                    dataLoadedRef.current = true;
                    const allProducts: AdminProduct[] = [];

                    inventory.forEach((item) => {
                        item.products.forEach((product) => {
                            allProducts.push({
                                name: product.label,
                                category: item.category,
                                stock: product.stock ?? null,
                                currencies: product.prices.map(String),
                                vat: item.rate >= 1 ? item.rate : item.rate * 100,
                            });
                        });
                    });

                    setProducts(allProducts);
                    setOriginalProducts(allProducts);
                    setIsLoading(false);
                    return;
                }

                // Load cached data first from useConfig (inventory/currencies)
                if (inventory?.length && currencies?.length) {
                    const allProducts: AdminProduct[] = [];

                    inventory.forEach((item) => {
                        item.products.forEach((product) => {
                            allProducts.push({
                                name: product.label,
                                category: item.category,
                                stock: product.stock ?? null,
                                currencies: product.prices.map(String),
                                vat: item.rate >= 1 ? item.rate : item.rate * 100,
                            });
                        });
                    });

                    setProducts(allProducts);
                    setOriginalProducts(allProducts);
                    setIsLoading(false);
                }

                // Always fetch fresh data from DB in background
                const [productsResponse, parametersResponse] = await Promise.all([
                    fetch('/api/sql/getAllArticles'),
                    fetch('/api/sql/getParameters'),
                ]);
                const productsData = await productsResponse.json();
                const parametersData = await parametersResponse.json();

                // Parse productsSettings from parameters
                if (parametersData.parameters) {
                    const paramMap = new Map<string, string>();
                    parametersData.parameters.forEach(({ key, value }: { key: string; value: string }) => {
                        paramMap.set(key, value);
                    });
                    const raw = paramMap.get('productsSettings');
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed && typeof parsed === 'object') {
                                setProductsSettings({
                                    useVatPerProduct: parsed.useVatPerProduct ?? false,
                                    useReference: parsed.useReference ?? false,
                                    useStock: parsed.useStock ?? false,
                                    usePhoto: parsed.usePhoto ?? false,
                                    useDescription: parsed.useDescription ?? false,
                                    useOptions: parsed.useOptions ?? false,
                                });
                            }
                        } catch {
                            // Invalid JSON, keep default
                        }
                    }
                }

                // Parse products from typed API objects
                const loadedProducts: AdminProduct[] = [];
                if (Array.isArray(productsData.products)) {
                    for (const p of productsData.products) {
                        loadedProducts.push({
                            name: String(p.label),
                            category: String(p.category),
                            stock: p.stock === null || p.stock === undefined ? null : Number(p.stock),
                            vat: p.rate != null ? Number(p.rate) * 100 : undefined,
                            reference: p.reference ? String(p.reference) : undefined,
                            photo: p.photo ? String(p.photo) : undefined,
                            description: p.description ? String(p.description) : undefined,
                            options: p.options ? String(p.options) : undefined,
                            currencies: (p.prices ?? []).map(String),
                        });
                    }
                }

                setProducts(loadedProducts);
                setOriginalProducts(loadedProducts);

                // Initialize options from products
                const loadedOptions: ProductOptionGroup[] = [];
                loadedProducts.forEach((p) => {
                    if (p.options) {
                        try {
                            const parsed = JSON.parse(p.options);
                            // Check if it's in the ProductOptionGroup format
                            if (parsed.type && Array.isArray(parsed.options)) {
                                loadedOptions.push({
                                    category: p.category || 'Sans catégorie',
                                    product: p.name,
                                    type: parsed.type,
                                    options: parsed.options,
                                });
                            }
                        } catch {
                            // Ignore invalid options
                        }
                    }
                });
                setOptions(loadedOptions);
                setOriginalOptions(loadedOptions);
            } catch (error) {
                console.error('Error fetching menu data:', error);
                openFullscreenPopup('Erreur lors du chargement des données', ['OK']);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [dbConfigChecked, isReadOnly, openFullscreenPopup, isStateReady, inventory, currencies]);

    const handleProductsChange = useCallback(
        (data: AdminProduct[]) => {
            if (!isReadOnly) {
                setProducts(data);
            }
        },
        [isReadOnly]
    );

    const handleProductsSave = useCallback(
        async (data: AdminProduct[], category?: string) => {
            setIsSavingProducts(true);
            try {
                const response = await fetch('/api/sql/updateArticles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ products: data, category }),
                });

                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.error || 'Failed to save products');
                }

                setProducts(data);
                setOriginalProducts(data);

                const config: Config = {
                    parameters: { ...parameters, lastModified: Date.now().toString() },
                    currencies,
                    paymentMethods,
                    inventory: buildInventoryFromAdminProducts(data),
                    discounts,
                    colors,
                    printers,
                    customers,
                    users,
                };
                setConfig(config);
                clearLoadDataCache();
            } catch (error) {
                console.error("Erreur lors de l'enregistrement:", error);
                const msg = error instanceof Error ? error.message : "Erreur lors de l'enregistrement des produits.";
                openFullscreenPopup(`${msg}\nVoulez-vous réessayer ?`, ['Réessayer', 'Annuler'], (index) => {
                    if (index === 0) handleProductsSave(data, category);
                });
            } finally {
                setIsSavingProducts(false);
            }
        },
        [
            openFullscreenPopup,
            parameters,
            currencies,
            setConfig,
            paymentMethods,
            discounts,
            colors,
            printers,
            customers,
            users,
        ]
    );

    // Category rename: update all products with the old category name and save to DB
    // 'Sans catégorie' maps to products with category === ''
    const handleCategoryRename = useCallback(
        (oldLabel: string, newLabel: string) => {
            const oldKey = oldLabel === 'Sans catégorie' ? '' : oldLabel.trim();
            const trimmedNewLabel = newLabel.trim();
            setProducts((prev) => {
                const updated = prev.map((p) =>
                    (p.category || '').trim() === oldKey ? { ...p, category: trimmedNewLabel } : p
                );
                setTimeout(() => handleProductsSave(updated, trimmedNewLabel), 0);
                return updated;
            });
        },
        [handleProductsSave]
    );

    // Category delete: either remove products or move them to empty category, then save
    const handleDeleteCategoryProducts = useCallback(
        (categoryLabel: string, moveToEmpty: boolean) => {
            const key = categoryLabel === 'Sans catégorie' ? '' : categoryLabel.trim();
            if (moveToEmpty) {
                setProducts((prev) => {
                    const updated = prev.map((p) => ((p.category || '').trim() === key ? { ...p, category: '' } : p));
                    setTimeout(() => handleProductsSave(updated, ''), 0);
                    return updated;
                });
            } else {
                setProducts((prev) => {
                    const updated = prev.filter((p) => (p.category || '').trim() !== key);
                    setTimeout(() => handleProductsSave(updated, key), 0);
                    return updated;
                });
            }
        },
        [handleProductsSave]
    );

    // Category VAT change: apply new VAT to all products in the category and save to DB
    const handleCategoryVatChange = useCallback(
        (categoryLabel: string, vat: number) => {
            const key = categoryLabel === 'Sans catégorie' ? '' : categoryLabel.trim();
            setProducts((prev) => {
                const updated = prev.map((p) => ((p.category || '').trim() === key ? { ...p, vat } : p));
                setTimeout(() => handleProductsSave(updated, categoryLabel), 0);
                return updated;
            });
        },
        [handleProductsSave]
    );

    // Category reorder: reorder all products so they follow the new category order, then save
    const handleCategoryReorder = useCallback(
        (orderedLabels: string[]) => {
            setProducts((prev) => {
                const labelToKey = (l: string) => (l === 'Sans catégorie' ? '' : l);
                const sorted = [
                    ...orderedLabels.flatMap((label) => prev.filter((p) => p.category === labelToKey(label))),
                    ...prev.filter((p) => !orderedLabels.map(labelToKey).includes(p.category)),
                ];
                // Schedule save after state settles
                setTimeout(() => handleProductsSave(sorted), 0);
                return sorted;
            });
        },
        [handleProductsSave]
    );

    const hasProductsChanges = JSON.stringify(products) !== JSON.stringify(originalProducts);
    const hasChanges = hasProductsChanges;

    // Warn about unsaved changes when leaving page
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasChanges) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges]);

    const handleCancel = () => {
        setProducts(originalProducts);
    };

    // Redirect if using Digicarte
    if (USE_DIGICARTE) return null;

    if (isLoading) {
        return (
            <AdminPageLayout title="Édition des produits" hasChanges={false}>
                <LoadingDot fullscreen />
            </AdminPageLayout>
        );
    }

    // Check access - admin and cashier only
    if (!isCashier) {
        return (
            <AdminPageLayout title="Édition des produits" hasChanges={false}>
                <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg">
                    <p className="text-red-800 dark:text-red-200">
                        <strong>Accès refusé :</strong> Cette page est réservée aux administrateurs et caissiers.
                    </p>
                </div>
            </AdminPageLayout>
        );
    }

    return (
        <AdminPageLayout title="Édition des produits" hasChanges={hasChanges}>
            {isReadOnly && (
                <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-600 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>Mode lecture seule :</strong> La base de données n'est pas configurée. Les modifications
                        ne seront pas enregistrées.
                    </p>
                </div>
            )}

            <div className="space-y-6">
                <CategoriesConfig
                    config={categories}
                    isReadOnly={isReadOnly}
                    isOpen={openSection === 'categories'}
                    onToggle={() => setOpenSection((prev) => (prev === 'categories' ? null : 'categories'))}
                    productCategories={products.map((p) => ({
                        category: p.category || 'Sans catégorie',
                        available: p.stock !== 0,
                    }))}
                    onDeleteCategoryProducts={handleDeleteCategoryProducts}
                    onRenameCategory={handleCategoryRename}
                    onCategoryVatChange={handleCategoryVatChange}
                    onReorderCategories={isReadOnly ? undefined : handleCategoryReorder}
                    onLocalCategoriesChange={setLocalCategoryLabels}
                    icon={<IconCategory size={24} />}
                />

                {/* Options Configuration Section - only visible when useOptions is enabled and there are categories */}
                {productsSettings?.useOptions && categories.length > 0 && (
                    <OptionsConfig
                        config={options}
                        categories={categories.map((c) => ({ label: c.label, value: c.label }))}
                        products={products.map((p) => ({ name: p.name, category: p.category }))}
                        currencies={currencies}
                        onChange={(newOptions) => {
                            setOptions(newOptions);
                            setHasOptionsChanges(JSON.stringify(newOptions) !== JSON.stringify(originalOptions));
                        }}
                        onSave={async (newOptions) => {
                            // Map options to products
                            const updatedProducts = products.map((p) => {
                                const optionGroup = newOptions.find(
                                    (o) => o.category === (p.category || 'Sans catégorie') && o.product === p.name
                                );
                                return {
                                    ...p,
                                    options: optionGroup
                                        ? JSON.stringify({ type: optionGroup.type, options: optionGroup.options })
                                        : '',
                                };
                            });
                            await handleProductsSave(updatedProducts);
                            setOriginalOptions(newOptions);
                            setHasOptionsChanges(false);
                        }}
                        onCancel={() => {
                            setOptions(originalOptions);
                            setHasOptionsChanges(false);
                        }}
                        hasChanges={hasOptionsChanges}
                        isReadOnly={isReadOnly}
                        isLoading={isSavingProducts}
                        isOpen={openSection === 'options'}
                        onToggle={() => setOpenSection((prev) => (prev === 'options' ? null : 'options'))}
                        icon={<IconListDetails size={24} />}
                    />
                )}

                <ProductsConfig
                    config={products}
                    onChange={handleProductsChange}
                    onSave={isReadOnly ? undefined : handleProductsSave}
                    onCancel={handleCancel}
                    hasChanges={hasProductsChanges}
                    categories={categoryOptions}
                    currencies={currencies}
                    isReadOnly={isReadOnly}
                    isLoading={isSavingProducts}
                    isOpen={openSection === 'products'}
                    onToggle={() => setOpenSection((prev) => (prev === 'products' ? null : 'products'))}
                    productsSettings={productsSettings}
                    icon={<IconBox size={24} />}
                    showHeader={products.length > 0}
                />
            </div>
        </AdminPageLayout>
    );
}
