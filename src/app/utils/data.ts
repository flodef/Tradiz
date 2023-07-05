export const otherKeyword = 'Autres';
export const categorySeparator = '>';
export const maxDecimals = 2;
export const maxValue = 999.99;
export const currency = '€';
export const defaultDate = [new Date().getFullYear(), new Date().getMonth(), new Date().getDate()].join('-');

export const inventory = [
    {
        category: 'Boulange',
        rate: 5.5,
        products: [
            { label: 'Baguette', price: 1.3 },
            { label: 'Baguette graine', price: 1.6 },
            { label: 'Campagne (500g)', price: 3 },
            { label: 'Campagne (1kg)', price: 6 },
            { label: 'Campagne (coupe)', price: 0 },
            { label: 'Multi moulé', price: 5.5 },
            { label: 'Multi masse', price: 0 },
            { label: 'Complet', price: 3 },
            { label: 'Sésame Pavot Lin', price: 3 },
            { label: 'Pain blanc', price: 3 },
            { label: 'Raisin Noisette', price: 4 },
            { label: 'Pain aux Noix', price: 3.5 },
            { label: 'Pain indien', price: 3.8 },
            { label: 'Petit épeautre', price: 4.9 },
            { label: 'Sans Gluten', price: 5.2 },
        ],
    },
    {
        category: 'Pâtisserie',
        rate: 5.5,
        products: [
            { label: 'Croissant', price: 1.3 },
            { label: 'Pain au Chocolat', price: 1.4 },
            { label: 'Pain au Lait', price: 1.1 },
            { label: 'Krozaman', price: 2 },
            { label: 'Tarte au citron', price: 2.5 },
            { label: 'Brownie / Brockie', price: 2.2 },
            { label: 'Tartelette Fruit', price: 2.8 },
            { label: 'Carotte cake / Cheese cake', price: 2.2 },
        ],
    },
    {
        category: 'Epicerie',
        rate: 5.5,
        products: [
            { label: 'Jus de pomme', price: 3.9 },
            { label: 'Jus framboise/fraise', price: 4.1 },
            { label: 'Farine', price: 0 },
            { label: 'Huile', price: 0 },
            { label: 'Lentilles', price: 0 },
            { label: 'Pâté', price: 0 },
            { label: 'Confitures', price: 0 },
            { label: 'Miel', price: 0 },
            { label: 'Oeuf (x6)', price: 2.9 },
            { label: 'Beurre', price: 6.9 },
            { label: 'Lait', price: 2.1 },
        ],
    },
    {
        category: 'Salon⋅Thé',
        rate: 10,
        products: [
            { label: 'Café court / moyen', price: 1.5 },
            { label: 'Café allongé', price: 2 },
            { label: 'Café au lait', price: 3 },
            { label: 'Cappucino', price: 3 },
            { label: 'Chocolat', price: 3 },
            { label: 'Thé', price: 3 },
            { label: 'Jus de fruit (verre)', price: 2.5 },
        ],
    },
    {
        category: 'Alcool',
        rate: 20,
        products: [
            { label: 'Cidre', price: 0 },
            { label: 'Bière', price: 0 },
            { label: 'Vin', price: 0 },
        ],
    },
    {
        category: otherKeyword,
        rate: 0,
        products: [
            { label: 'Journal', price: 1.3 },
            { label: 'Journal (week-end)', price: 1.5 },
            { label: 'Carte Postale', price: 0 },
            { label: 'Tableau', price: 0 },
            { label: 'Couture', price: 0 },
            { label: 'Livres', price: 0 },
            { label: 'Art', price: 0 },
            { label: 'Savons (Morgane)', price: 0 },
        ],
    },
];

export const paymentMethods = ['CB', 'Espèces', 'Chèque', 'Crypto'];
