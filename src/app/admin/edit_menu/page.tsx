'use client';

import AdminPageLayout from '@/app/components/admin/AdminPageLayout';
import CategoriesConfig from '@/app/components/admin/sections/CategoriesConfig';
import OptionsConfig, { ProductOptionGroup } from '@/app/components/admin/sections/OptionsConfig';
import ProductsConfig, { AdminProduct } from '@/app/components/admin/sections/ProductsConfig';
import FormulasConfig, { AdminFormula, FormulaElement } from '@/app/components/admin/sections/FormulasConfig';
import CatalogEditor from '@/app/components/admin/sections/CatalogEditor';
import { Config, ProductsSettings } from '@/app/contexts/ConfigProvider';
import { useConfig } from '@/app/hooks/useConfig';
import { usePopup } from '@/app/hooks/usePopup';
import { useUserRole } from '@/app/hooks/useUserRole';
import { useWindowParam } from '@/app/hooks/useWindowParam';
import Loading from '@/app/loading';
import { DEFAULT_CATEGORY, USE_DIGICARTE } from '@/app/utils/constants';
import { applyCategoryDeletionToFormulas, isSameCategory, renameFormulaCategory } from '@/app/utils/category';
import { Category, Company, InventoryItem } from '@/app/utils/interfaces';
import { clearLoadDataCache, DEFAULT_DISPLAY_SETTINGS } from '@/app/utils/processData';
import { encodeGridPosition, encodeSortOrder, decodeGridPosition } from '@/app/utils/sortOrder';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconCategory, IconListDetails, IconBox, IconMathFunction, IconLayoutGrid } from '@tabler/icons-react';
import { useSearchParams } from 'next/navigation';

const FORMULA_CATEGORY = 'Formule';

function adminProductToFormula(product: AdminProduct): AdminFormula | null {
    if (!product.options) {
        return {
            name: product.name,
            price: product.currencies[0] || '0',
            mode: 'products',
            category: '',
            elements: [],
        };
    }
    try {
        const parsed = JSON.parse(product.options);
        if (!parsed.formula || !Array.isArray(parsed.elements)) {
            return {
                name: product.name,
                price: product.currencies[0] || '0',
                mode: 'products',
                category: '',
                elements: [],
            };
        }
        const elements = parsed.elements as FormulaElement[];
        const mode = elements.some((el) => el.category) ? 'category' : 'products';
        // For product mode, flatten all products into a single element
        const normalizedElements =
            mode === 'products' ? [{ name: '', products: elements.flatMap((el) => el.products || []) }] : elements;
        return {
            name: parsed.originalName || product.name,
            price: product.currencies[0] || '0',
            mode,
            category: parsed.category || '',
            elements: normalizedElements,
        };
    } catch {
        return {
            name: product.name,
            price: product.currencies[0] || '0',
            mode: 'products',
            category: '',
            elements: [],
        };
    }
}

function splitFormulas(allProducts: AdminProduct[]): { products: AdminProduct[]; formulas: AdminFormula[] } {
    const products: AdminProduct[] = [];
    const formulas: AdminFormula[] = [];
    for (const p of allProducts) {
        if (p.category === FORMULA_CATEGORY) {
            const formula = adminProductToFormula(p);
            if (formula) formulas.push(formula);
        } else {
            products.push(p);
        }
    }
    return { products, formulas };
}

function buildInventoryFromAdminProducts(products: AdminProduct[]): InventoryItem[] {
    const inventory: InventoryItem[] = [];
    const categoryIndex: Record<string, number> = {};
    const categoryOrder: string[] = [];

    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const label = (p.name || '').trim();
        if (!label) continue;

        const category = (p.category || '').trim() || DEFAULT_CATEGORY;

        if (categoryIndex[category] === undefined) {
            categoryIndex[category] = inventory.length;
            categoryOrder.push(category);
            inventory.push({
                category: category.toFirstUpperCase(),
                rate: p.vat ?? 0,
                order: inventory.length,
                products: [],
            });
        }

        const catIdx = categoryOrder.indexOf(category);
        const item = inventory[categoryIndex[category]];

        // Compute sortOrder using the shared encoding:
        // (catIdx + 1) * 10000 + position
        // Catalog mode: position = row * 100 + col (from gridPosition)
        // List mode: position = sequential index within category
        let position: number;
        if (p.gridPosition != null && p.gridPosition >= 0) {
            position = encodeGridPosition(p.gridPosition);
        } else {
            position = item.products.length;
        }
        const sortOrder = encodeSortOrder(catIdx, position);

        item.products.push({
            label: label.toFirstUpperCase(),
            prices: p.currencies.map((c) => Number(c)).filter((price) => Number.isFinite(price)),
            options: p.options || null,
            stock: p.stock ?? null,
            order: item.products.length,
            reference: p.reference ? String(p.reference).trim() : null,
            color: p.color ?? '',
            sortOrder,
            employerShare: p.employerShare ?? null,
        });
    }

    return inventory;
}

function buildInventoryFromAdminFormulas(formulas: AdminFormula[]): InventoryItem[] {
    const inventory: InventoryItem[] = [];
    const category = FORMULA_CATEGORY;

    inventory.push({
        category: category.toFirstUpperCase(),
        rate: 20, // Default VAT for formulas
        order: 0,
        products: [],
    });

    const item = inventory[0];
    for (let i = 0; i < formulas.length; i++) {
        const f = formulas[i];
        const label = (f.name || '').trim();
        if (!label) continue;

        item.products.push({
            label: label.toFirstUpperCase(),
            prices: [Number(f.price) || 0].filter((price) => Number.isFinite(price)),
            options: JSON.stringify({ formula: true, category: f.category, elements: f.elements }),
            stock: null,
            order: i,
            reference: null,
            color: '',
        });
    }

    return inventory;
}

function buildProductsFromInventory(inventory: InventoryItem[]): AdminProduct[] {
    const products: AdminProduct[] = [];
    inventory.forEach((item) => {
        // The UI displays an empty DB category as the default category; for editing we keep it as empty string.
        const category = item.category === DEFAULT_CATEGORY ? '' : item.category;
        item.products.forEach((product) => {
            // Decode gridPosition from sortOrder if in catalog-mode range
            const gridPosition = product.sortOrder != null ? decodeGridPosition(product.sortOrder) : undefined;
            products.push({
                name: product.label,
                category,
                stock: product.stock ?? null,
                currencies: product.prices.map(String),
                vat: item.rate >= 1 ? item.rate : item.rate * 100,
                reference: product.reference ?? undefined,
                options: product.options ?? undefined,
                color: product.color ?? undefined,
                employerShare: product.employerShare ?? undefined,
                gridPosition,
            });
        });
    });
    return products;
}

export default function EditMenuPage() {
    const {
        inventory,
        currencies,
        parameters,
        setConfig,
        setParameters,
        paymentMethods,
        discounts,
        colors,
        printers,
        customers,
        users,
        isStateReady,
    } = useConfig();
    const { isCashier } = useUserRole();
    const { isOnline } = useWindowParam();
    const { openFullscreenPopup } = usePopup();
    const searchParams = useSearchParams();
    const [products, setProducts] = useState<AdminProduct[]>([]);
    const [originalProducts, setOriginalProducts] = useState<AdminProduct[]>([]);
    const [formulas, setFormulas] = useState<AdminFormula[]>([]);
    const [originalFormulas, setOriginalFormulas] = useState<AdminFormula[]>([]);
    const [hasFormulasChanges, setHasFormulasChanges] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isReadOnly, setIsReadOnly] = useState(true);
    const [dbConfigChecked, setDbConfigChecked] = useState(false);
    const [isSavingProducts, setIsSavingProducts] = useState(false);
    const [isSavingFormulas, setIsSavingFormulas] = useState(false);
    const [productsSettings, setProductsSettings] = useState<ProductsSettings | undefined>(parameters?.products);
    // Local catalogMode state — initialized from context, updated from DB fetch.
    // We use a local state because the context's parameters may be stale from
    // localStorage cache on regular refresh, and the ConfigProvider's own DB
    // fetch may not update it in time for rendering.
    const [catalogMode, setCatalogMode] = useState<boolean>(parameters?.display?.catalogMode === true);
    // Don't render ProductsConfig or CatalogEditor until catalogMode has been
    // resolved from the DB fetch. Otherwise the stale localStorage cache value
    // may show Products first, then flicker to Catalog when the DB value arrives.
    const [catalogModeResolved, setCatalogModeResolved] = useState(false);
    const [openSection, setOpenSection] = useState<string | null>(
        parameters?.display?.catalogMode ? 'catalog' : 'products'
    );
    const [options, setOptions] = useState<ProductOptionGroup[]>([]);
    const [originalOptions, setOriginalOptions] = useState<ProductOptionGroup[]>([]);
    const [hasOptionsChanges, setHasOptionsChanges] = useState(false);
    const [emptyProductsPopupShown, setEmptyProductsPopupShown] = useState(false);
    const [dbCategories, setDbCategories] = useState<
        { name: string; company: string | null; printer: string | null; sortOrder: number; originalName?: string }[]
    >([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [originalDbCategories, setOriginalDbCategories] = useState<
        { name: string; company: string | null; printer: string | null; sortOrder: number; originalName?: string }[]
    >([]);
    const dataLoadedRef = useRef(false);
    const seededRef = useRef(false);
    const parametersRef = useRef(parameters);
    parametersRef.current = parameters;

    // Derive categories from DB (source of truth for name, company, sortOrder)
    // and products (for VAT inference). DB categories come first; any product-only
    // categories (not yet in DB) are appended.
    const categories = useMemo(() => {
        const catVats = new Map<string, Set<number>>();
        for (const p of products) {
            const cat = p.category || DEFAULT_CATEGORY;
            if (!catVats.has(cat)) catVats.set(cat, new Set());
            catVats.get(cat)!.add(p.vat ?? 20);
        }
        const result: Category[] = [];
        const seen = new Set<string>();
        // DB categories first (in their sort order)
        for (const dbCat of dbCategories) {
            const label = dbCat.name || DEFAULT_CATEGORY;
            seen.add(label);
            const vats = catVats.get(label);
            result.push({
                label,
                vat: vats && vats.size === 1 ? [...vats][0] : null,
                company: dbCat.company,
                printerLabel: dbCat.printer,
                sortOrder: dbCat.sortOrder,
            });
        }
        // Product-only categories not in DB
        for (const [label, vats] of catVats) {
            if (!seen.has(label)) {
                result.push({
                    label,
                    vat: vats.size === 1 ? [...vats][0] : null,
                    company: null,
                    printerLabel: null,
                    sortOrder: result.length,
                });
            }
        }
        return result;
    }, [products, dbCategories]);

    // Persists categories to the DB.
    const saveCategoriesToDb = useCallback(
        async (
            cats: {
                name: string;
                company: string | null;
                printer: string | null;
                sortOrder: number;
                originalName?: string;
            }[]
        ) => {
            const response = await fetch('/api/sql/updateCategories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categories: cats }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to save categories');
            }
        },
        []
    );

    const [localCategoryLabels, setLocalCategoryLabels] = useState<string[]>([]);
    const categoryOptions = useMemo(() => {
        const base = categories.map((c) => c.label);
        const extras = localCategoryLabels.filter((l) => l && !base.includes(l));
        return [...base, ...extras].map((l) => ({ label: l, value: l }));
    }, [categories, localCategoryLabels]);

    // When new categories are added locally, update local state only.
    // DB persistence happens when the user clicks Save (via handleProductsSave).
    const handleLocalCategoriesChange = useCallback(
        (labels: string[]) => {
            setLocalCategoryLabels(labels);
            // Merge new labels into DB categories (local state only)
            const newLabels = labels.filter((l) => l && !dbCategories.some((c) => c.name === l));
            if (newLabels.length > 0) {
                const updatedDbCats = [
                    ...dbCategories,
                    ...newLabels.map((name, i) => ({
                        name,
                        company: null,
                        printer: null,
                        sortOrder: dbCategories.length + i,
                    })),
                ];
                setDbCategories(updatedDbCats);
            }
        },
        [dbCategories]
    );

    // Company change for a category — local state only, persisted on Save
    const handleCategoryCompanyChange = useCallback(
        (categoryLabel: string, company: string | null) => {
            const updatedDbCats = dbCategories.map((c) => (c.name === categoryLabel ? { ...c, company } : c));
            setDbCategories(updatedDbCats);
        },
        [dbCategories]
    );

    // Printer change for a category — local state only, persisted on Save
    const handleCategoryPrinterChange = useCallback(
        (categoryLabel: string, printer: string | null) => {
            const updatedDbCats = dbCategories.map((c) => (c.name === categoryLabel ? { ...c, printer } : c));
            setDbCategories(updatedDbCats);
        },
        [dbCategories]
    );

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

    // When catalogMode is resolved from the DB fetch, sync the open section.
    useEffect(() => {
        if (!catalogModeResolved) return;
        setOpenSection(catalogMode ? 'catalog' : 'products');
    }, [catalogMode, catalogModeResolved]);

    // Phase 1: seed the UI instantly from cached inventory/currencies (no loading dots).
    // This shows products immediately; the DB fetch below adds fields not present in the
    // cached inventory (reference, photo, description, options and option groups).
    useEffect(() => {
        if (seededRef.current) return;
        if (isStateReady && inventory?.length && currencies?.length) {
            seededRef.current = true;
            const allProducts = buildProductsFromInventory(inventory);
            const { products: nonFormula, formulas: formulaList } = splitFormulas(allProducts);
            setProducts(nonFormula);
            setOriginalProducts(nonFormula);
            setFormulas(formulaList);
            setOriginalFormulas(formulaList);
            setIsLoading(false);
        }
    }, [isStateReady, inventory, currencies]);

    // Phase 2: once the DB config check completes, load the full data set.
    // For read-only (no DB) we rely on cached inventory; otherwise we fetch fresh product
    // details from the DB so nothing is lost when the page was seeded from cache.
    useEffect(() => {
        const fetchData = async () => {
            if (dataLoadedRef.current) return;
            if (!dbConfigChecked) return;

            if (!seededRef.current) setIsLoading(true);

            try {
                if (isReadOnly) {
                    // No DB — use spreadsheet data from useConfig
                    if (!inventory?.length || !currencies?.length) {
                        // Wait for inventory/currencies to load - will re-run when they change
                        return;
                    }
                    dataLoadedRef.current = true;
                    const allProducts = buildProductsFromInventory(inventory);
                    const { products: nonFormula, formulas: formulaList } = splitFormulas(allProducts);
                    setProducts(nonFormula);
                    setOriginalProducts(nonFormula);
                    setFormulas(formulaList);
                    setOriginalFormulas(formulaList);

                    // Build inventory from ALL products (including formulas) for main app
                    const inventoryFromDb = buildInventoryFromAdminProducts(allProducts);
                    const config: Config = {
                        parameters: { ...parametersRef.current, lastModified: Date.now().toString() },
                        currencies,
                        paymentMethods,
                        inventory: inventoryFromDb,
                        discounts,
                        colors,
                        printers,
                        customers,
                        users,
                    };
                    setConfig(config);
                    setCatalogMode(parametersRef.current?.display?.catalogMode === true);
                    setCatalogModeResolved(true);

                    setIsLoading(false);
                    return;
                }

                dataLoadedRef.current = true;

                // Always fetch fresh data from DB in background
                const [productsResponse, parametersResponse, categoriesResponse, companiesResponse] = await Promise.all(
                    [
                        fetch('/api/sql/getAllArticles'),
                        fetch('/api/sql/getParameters'),
                        fetch('/api/sql/getCategories'),
                        fetch('/api/sql/getCompanies'),
                    ]
                );
                const productsData = await productsResponse.json();
                const parametersData = await parametersResponse.json();
                const categoriesData = await categoriesResponse.json();
                const companiesData = await companiesResponse.json();

                // Load companies
                if (Array.isArray(companiesData.companies)) {
                    const mappedCompanies = companiesData.companies.map(
                        (c: { id?: number; name: string; employerShare: number }) => ({
                            id: c.id,
                            name: String(c.name),
                            employerShare: Number(c.employerShare ?? 0),
                        })
                    );
                    setCompanies(mappedCompanies);
                }

                // Load DB categories
                if (Array.isArray(categoriesData.categories)) {
                    const mapped = categoriesData.categories.map(
                        (c: { name: string; company: string | null; printer: string | null; sortOrder: number }) => ({
                            name: String(c.name),
                            company: c.company ?? null,
                            printer: c.printer ?? null,
                            sortOrder: Number(c.sortOrder) || 0,
                        })
                    );
                    setDbCategories(mapped);
                    setOriginalDbCategories(mapped);
                }

                // Parse productsSettings and display from parameters
                const currentParameters = parametersRef.current;
                let fetchedCatalogMode = currentParameters?.display?.catalogMode === true;
                if (parametersData.parameters) {
                    const paramMap = new Map<string, string>();
                    parametersData.parameters.forEach(({ key, value }: { key: string; value: string }) => {
                        paramMap.set(key, value);
                    });
                    // Parse display.catalogMode from DB (authoritative for grid decoding)
                    const rawDisplay = paramMap.get('displaySettings');
                    if (rawDisplay) {
                        try {
                            const parsed = JSON.parse(rawDisplay);
                            if (parsed && typeof parsed.catalogMode === 'boolean') {
                                fetchedCatalogMode = parsed.catalogMode;
                            }
                        } catch {
                            // Invalid JSON, use context value
                        }
                    }
                    // Update local catalogMode state immediately for rendering
                    setCatalogMode(fetchedCatalogMode);
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
                                    useColor: parsed.useColor ?? false,
                                    useEmployerShare: parsed.useEmployerShare ?? false,
                                });
                            }
                        } catch {
                            // Invalid JSON, keep default
                        }
                    }
                }

                // Parse products from typed API objects
                const loadedProducts: AdminProduct[] = [];
                const isCatalogMode = fetchedCatalogMode;
                if (Array.isArray(productsData.products)) {
                    for (const p of productsData.products) {
                        const gridPosition =
                            p.sortOrder != null && isCatalogMode ? decodeGridPosition(p.sortOrder) : undefined;
                        loadedProducts.push({
                            name: String(p.label),
                            category: String(p.category),
                            stock: p.stock === null || p.stock === undefined ? null : Number(p.stock),
                            vat: p.rate != null ? Number(p.rate) * 100 : undefined,
                            reference: p.reference ? String(p.reference) : undefined,
                            photo: p.photo ? String(p.photo) : undefined,
                            description: p.description ? String(p.description) : undefined,
                            options: p.options ? String(p.options) : undefined,
                            color: p.color ? String(p.color) : undefined,
                            currencies: (p.prices ?? []).map(String),
                            employerShare: p.employerShare != null ? Number(p.employerShare) : undefined,
                            gridPosition,
                        });
                    }
                }

                // Split formulas for admin editing, but build inventory from all products
                const { products: nonFormula, formulas: formulaList } = splitFormulas(loadedProducts);
                setProducts(nonFormula);
                setOriginalProducts(nonFormula);
                setFormulas(formulaList);
                setOriginalFormulas(formulaList);

                // Build inventory from ALL products (including formulas) for main app
                const inventoryFromDb = buildInventoryFromAdminProducts(loadedProducts);
                const paramForConfig = parametersRef.current;
                const updatedParameters = {
                    ...paramForConfig,
                    display: {
                        ...DEFAULT_DISPLAY_SETTINGS,
                        ...paramForConfig.display,
                        catalogMode: fetchedCatalogMode,
                    },
                    lastModified: Date.now().toString(),
                };
                const config: Config = {
                    parameters: updatedParameters,
                    currencies,
                    paymentMethods,
                    inventory: inventoryFromDb,
                    discounts,
                    colors,
                    printers,
                    customers,
                    users,
                };
                setConfig(config);
                setParameters(updatedParameters);

                // Initialize options from products (excluding formulas)
                const loadedOptions: ProductOptionGroup[] = [];
                nonFormula.forEach((p) => {
                    if (p.options) {
                        try {
                            const parsed = JSON.parse(p.options);
                            // Check if it's in the ProductOptionGroup format
                            if (parsed.type && Array.isArray(parsed.options)) {
                                loadedOptions.push({
                                    category: p.category || DEFAULT_CATEGORY,
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
                // Resolve unconditionally: on failure we fall back to the cached
                // localStorage catalogMode rather than rendering nothing at all.
                setCatalogModeResolved(true);
                setIsLoading(false);
            }
        };

        fetchData();
    }, [
        dbConfigChecked,
        isReadOnly,
        openFullscreenPopup,
        inventory,
        currencies,
        paymentMethods,
        discounts,
        colors,
        printers,
        customers,
        users,
        setConfig,
        setParameters,
        setCatalogMode,
    ]);

    const handleProductsChange = useCallback(
        (data: AdminProduct[]) => {
            if (!isReadOnly) {
                setProducts(data);
            }
        },
        [isReadOnly]
    );

    const handleFormulasChange = useCallback(
        (data: AdminFormula[]) => {
            if (!isReadOnly) {
                setFormulas(data);
                setHasFormulasChanges(JSON.stringify(data) !== JSON.stringify(originalFormulas));
            }
        },
        [isReadOnly, originalFormulas]
    );

    const handleFormulasCancel = useCallback(() => {
        setFormulas(originalFormulas);
        setHasFormulasChanges(false);
    }, [originalFormulas]);

    // Persists formulas to the DB. Kept separate from handleFormulasSave so callers
    // that already own the config update (e.g. handleProductsSave) don't race on setConfig.
    // The shop is resolved server-side from the request host, so no shop ID is sent here.
    const saveFormulasToDb = useCallback(async (data: AdminFormula[]) => {
        const response = await fetch('/api/sql/updateFormulas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || body.details || 'Failed to save formulas');
        }
    }, []);

    const handleProductsSave = useCallback(
        async (
            data: AdminProduct[],
            category?: string,
            formulasOverride?: AdminFormula[],
            categoriesOverride?: {
                name: string;
                company: string | null;
                printer: string | null;
                sortOrder: number;
                originalName?: string;
            }[]
        ) => {
            const formulasToPersist = formulasOverride ?? formulas;
            const catsToPersist = categoriesOverride ?? dbCategories;
            setIsSavingProducts(true);
            try {
                // 1. Persist categories first (await) so updateArticles can resolve
                //    category names → IDs without FK violations.
                await saveCategoriesToDb(catsToPersist);

                // 2. Save products
                const response = await fetch('/api/sql/updateArticles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ products: data, category }),
                });

                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.error || 'Failed to save products');
                }

                // A full replace runs `DELETE FROM products`, and rel_formula_element_product
                // has ON DELETE CASCADE on product_id — so every formula→product link was just
                // wiped. Re-save the formulas to rebuild them against the new product rows.
                if (category === undefined && formulasToPersist.length > 0) {
                    await saveFormulasToDb(formulasToPersist);
                }

                setProducts(data);
                setOriginalProducts(data);
                // Sync originalDbCategories to the persisted state
                setOriginalDbCategories(catsToPersist);

                const config: Config = {
                    parameters: { ...parameters, lastModified: Date.now().toString() },
                    currencies,
                    paymentMethods,
                    inventory: [
                        ...buildInventoryFromAdminProducts(data),
                        ...buildInventoryFromAdminFormulas(formulasToPersist),
                    ],
                    discounts,
                    colors,
                    printers,
                    customers,
                    users,
                    categories: catsToPersist.map((c, i) => ({
                        id: i,
                        name: c.name,
                        company: c.company,
                        sortOrder: c.sortOrder ?? i,
                    })),
                };
                setConfig(config);
                clearLoadDataCache();
            } catch (error) {
                console.error("Erreur lors de l'enregistrement:", error);
                const msg = error instanceof Error ? error.message : "Erreur lors de l'enregistrement des produits.";
                openFullscreenPopup(`${msg}\nVoulez-vous réessayer ?`, ['Réessayer', 'Annuler'], (index) => {
                    if (index === 0) handleProductsSave(data, category, formulasOverride, categoriesOverride);
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
            formulas,
            saveFormulasToDb,
            saveCategoriesToDb,
            dbCategories,
        ]
    );

    const handleFormulasSave = useCallback(
        async (data: AdminFormula[]) => {
            setIsSavingFormulas(true);
            try {
                await saveFormulasToDb(data);

                setOriginalFormulas(data);
                setHasFormulasChanges(false);

                // Update inventory with new formulas
                const config: Config = {
                    parameters: { ...parameters, lastModified: Date.now().toString() },
                    currencies,
                    paymentMethods,
                    inventory: [...buildInventoryFromAdminProducts(products), ...buildInventoryFromAdminFormulas(data)],
                    discounts,
                    colors,
                    printers,
                    customers,
                    users,
                    categories: dbCategories.map((c, i) => ({
                        id: i,
                        name: c.name,
                        company: c.company,
                        sortOrder: c.sortOrder ?? i,
                    })),
                };
                setConfig(config);
                clearLoadDataCache();
            } catch (error) {
                console.error('Error saving formulas:', error);
                throw error;
            } finally {
                setIsSavingFormulas(false);
            }
        },
        [
            parameters,
            currencies,
            paymentMethods,
            products,
            discounts,
            colors,
            printers,
            customers,
            users,
            dbCategories,
            setConfig,
            saveFormulasToDb,
        ]
    );

    // Category rename: update all products and formula elements with the old category name
    const handleCategoryRename = useCallback(
        (oldLabel: string, newLabel: string) => {
            const trimmedNewLabel = newLabel.trim();
            if (!trimmedNewLabel || isSameCategory(oldLabel, trimmedNewLabel)) return;

            // Products store the default category as an empty string while the UI (and
            // formula elements) reference it by its label, so matching goes through
            // isSameCategory rather than a raw string comparison.
            const updatedProducts = products.map((p) =>
                isSameCategory(p.category, oldLabel) ? { ...p, category: trimmedNewLabel } : p
            );

            // Formula elements reference categories by label; rename them too.
            const updatedFormulas = renameFormulaCategory(formulas, oldLabel, trimmedNewLabel);

            // Update DB categories (local state only — persisted on Save)
            // Track originalName so the API can UPDATE the existing row instead of INSERT+DELETE
            const updatedDbCats = dbCategories.map((c) =>
                c.name === oldLabel ? { ...c, name: trimmedNewLabel, originalName: c.originalName ?? oldLabel } : c
            );
            setDbCategories(updatedDbCats);

            setProducts(updatedProducts);
            setFormulas(updatedFormulas);
            setHasFormulasChanges(false);

            // Full replace (category === undefined) so renamed rows can't be left behind
            // as duplicates. handleProductsSave re-saves the formulas afterwards, which
            // both persists the renamed element categories and rebuilds the
            // formula→product links that the product DELETE cascaded away.
            // setOriginalProducts/setOriginalFormulas are set by handleProductsSave on success.
            handleProductsSave(updatedProducts, undefined, updatedFormulas, updatedDbCats);
        },
        [products, formulas, dbCategories, handleProductsSave]
    );

    // Category delete: either remove products or move them to empty category, then save.
    // Also updates formula elements that referenced the deleted category.
    const handleDeleteCategoryProducts = useCallback(
        (categoryLabel: string, moveToEmpty: boolean) => {
            const updated = moveToEmpty
                ? products.map((p) => (isSameCategory(p.category, categoryLabel) ? { ...p, category: '' } : p))
                : products.filter((p) => !isSameCategory(p.category, categoryLabel));

            // Formula elements referencing the deleted category are moved to the default category
            // or dropped, mirroring what happens to the products.
            const updatedFormulas = applyCategoryDeletionToFormulas(formulas, categoryLabel, moveToEmpty);

            // Remove from DB categories (local state only — persisted on Save)
            const updatedDbCats = dbCategories.filter((c) => c.name !== categoryLabel);
            setDbCategories(updatedDbCats);

            setProducts(updated);
            setFormulas(updatedFormulas);
            setHasFormulasChanges(false);
            // setOriginalProducts/setOriginalFormulas are set by handleProductsSave on success.
            handleProductsSave(updated, undefined, updatedFormulas, updatedDbCats);
        },
        [products, formulas, dbCategories, handleProductsSave]
    );

    // Category VAT change: apply new VAT to all products in the category and save to DB
    const handleCategoryVatChange = useCallback(
        (categoryLabel: string, vat: number) => {
            setProducts((prev) => {
                const updated = prev.map((p) => (isSameCategory(p.category, categoryLabel) ? { ...p, vat } : p));
                // Save immediately with full DB replace to avoid duplicates
                handleProductsSave(updated, undefined);
                return updated;
            });
        },
        [handleProductsSave]
    );

    // Category reorder: update local state only — persisted when user clicks Save
    const handleCategoryReorder = useCallback(
        (orderedLabels: string[]) => {
            // Update dbCategories sort order (local state only)
            const updatedDbCats = orderedLabels.map((label, index) => {
                const existing = dbCategories.find((c) => c.name === label);
                return {
                    name: label,
                    company: existing?.company ?? null,
                    printer: existing?.printer ?? null,
                    sortOrder: index,
                };
            });
            setDbCategories(updatedDbCats);

            // Reorder products locally to match the new category order
            setProducts((prev) => {
                const sorted = [
                    ...orderedLabels.flatMap((label) => prev.filter((p) => isSameCategory(p.category, label))),
                    // Anything not covered by the new order keeps its relative position at the end
                    ...prev.filter((p) => !orderedLabels.some((label) => isSameCategory(p.category, label))),
                ];
                return sorted;
            });
        },
        [dbCategories]
    );

    const hasProductsChanges = JSON.stringify(products) !== JSON.stringify(originalProducts);
    const hasCategoriesChanges = JSON.stringify(dbCategories) !== JSON.stringify(originalDbCategories);
    const hasChanges = hasProductsChanges || hasFormulasChanges || hasOptionsChanges || hasCategoriesChanges;

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
        setDbCategories(originalDbCategories);
    };

    const handleSaveAll = async () => {
        if (hasProductsChanges || hasCategoriesChanges) {
            // handleProductsSave with category=undefined already persists formulas
            await handleProductsSave(products, undefined, undefined, dbCategories);
        } else if (hasFormulasChanges) {
            await handleFormulasSave(formulas);
        }
    };

    const nonFormulaProducts = useMemo(() => products.filter((p) => p.category !== FORMULA_CATEGORY), [products]);

    // The catalog grid needs at least one category to place tiles into, so we fall
    // back to the list editor when there are none. Formulas belong to the list
    // editor, so both gates must use this same predicate.
    const showCatalog = catalogMode && categories.length > 0;

    // Redirect if using Digicarte
    if (USE_DIGICARTE) return null;

    if (isLoading) {
        return (
            <AdminPageLayout title="Édition des produits" hasChanges={false}>
                <Loading fullscreen />
            </AdminPageLayout>
        );
    }

    // Check access - admin and cashier only
    if (!isCashier) {
        return (
            <AdminPageLayout title="Édition des produits" hasChanges={false}>
                <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg">
                    <p className="text-red-800 dark:text-red-200">
                        <strong>{!isOnline ? 'Hors ligne' : 'Accès refusé'} :</strong>{' '}
                        {!isOnline
                            ? 'Vérifiez votre connexion internet puis rechargez la page.'
                            : 'Cette page est réservée aux administrateurs et caissiers.'}
                    </p>
                </div>
            </AdminPageLayout>
        );
    }

    return (
        <AdminPageLayout title="Édition des produits" hasChanges={hasChanges} onSave={handleSaveAll}>
            {isReadOnly && (
                <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-600 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>Mode lecture seule :</strong> La base de données n'est pas configurée. Les modifications
                        ne seront pas enregistrées.
                    </p>
                </div>
            )}

            <div className="space-y-6">
                {catalogModeResolved && categories.length > 0 && (
                    <CategoriesConfig
                        config={categories}
                        isReadOnly={isReadOnly}
                        isOpen={openSection === 'categories'}
                        onToggle={() => setOpenSection((prev) => (prev === 'categories' ? null : 'categories'))}
                        productCategories={products.map((p) => ({
                            category: p.category || DEFAULT_CATEGORY,
                            available: p.stock !== 0,
                        }))}
                        onDeleteCategoryProducts={handleDeleteCategoryProducts}
                        onRenameCategory={handleCategoryRename}
                        onCategoryVatChange={handleCategoryVatChange}
                        onReorderCategories={isReadOnly ? undefined : handleCategoryReorder}
                        onLocalCategoriesChange={handleLocalCategoriesChange}
                        onCategoryCompanyChange={isReadOnly ? undefined : handleCategoryCompanyChange}
                        onCategoryPrinterChange={isReadOnly ? undefined : handleCategoryPrinterChange}
                        companies={customers
                            ?.map((c) => c.company)
                            .filter((c): c is string => Boolean(c))
                            .filter((c, i, arr) => arr.indexOf(c) === i)}
                        printers={printers?.map((p) => p.label) ?? []}
                        onSave={
                            isReadOnly
                                ? undefined
                                : () => handleProductsSave(products, undefined, undefined, dbCategories)
                        }
                        onCancel={handleCancel}
                        hasChanges={hasCategoriesChanges}
                        isLoading={isSavingProducts}
                        icon={<IconCategory size={24} />}
                    />
                )}

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
                                    (o) => o.category === (p.category || DEFAULT_CATEGORY) && o.product === p.name
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

                {catalogModeResolved &&
                    (showCatalog ? (
                        <CatalogEditor
                            products={nonFormulaProducts}
                            categories={categoryOptions}
                            allCategories={categories}
                            companies={companies}
                            currencies={currencies}
                            onChange={handleProductsChange}
                            onSave={isReadOnly ? undefined : handleProductsSave}
                            onCancel={handleCancel}
                            hasChanges={hasProductsChanges}
                            isReadOnly={isReadOnly}
                            isLoading={isSavingProducts}
                            isOpen={openSection === 'catalog'}
                            onToggle={() => setOpenSection((prev) => (prev === 'catalog' ? null : 'catalog'))}
                            icon={<IconLayoutGrid size={24} />}
                            productsSettings={productsSettings}
                        />
                    ) : (
                        <ProductsConfig
                            config={nonFormulaProducts}
                            onChange={handleProductsChange}
                            onSave={isReadOnly ? undefined : handleProductsSave}
                            onCancel={handleCancel}
                            hasChanges={hasProductsChanges}
                            categories={categoryOptions}
                            allCategories={categories}
                            companies={companies}
                            currencies={currencies}
                            isReadOnly={isReadOnly}
                            isLoading={isSavingProducts}
                            isOpen={openSection === 'products'}
                            onToggle={() => setOpenSection((prev) => (prev === 'products' ? null : 'products'))}
                            productsSettings={productsSettings}
                            icon={<IconBox size={24} />}
                            showHeader={nonFormulaProducts.length > 0}
                        />
                    ))}

                {catalogModeResolved && !showCatalog && (
                    <FormulasConfig
                        config={formulas}
                        categories={categories.map((c) => c.label)}
                        products={nonFormulaProducts}
                        currencies={currencies}
                        onChange={handleFormulasChange}
                        onSave={isReadOnly ? undefined : handleFormulasSave}
                        onCancel={handleFormulasCancel}
                        hasChanges={hasFormulasChanges}
                        isReadOnly={isReadOnly}
                        isLoading={isSavingFormulas}
                        isOpen={openSection === 'formulas'}
                        onToggle={() => setOpenSection((prev) => (prev === 'formulas' ? null : 'formulas'))}
                        icon={<IconMathFunction size={24} />}
                    />
                )}
            </div>
        </AdminPageLayout>
    );
}
