import { NextApiHandler } from 'next';
import products from '../data/products.json';

export const fetchProducts: NextApiHandler = async (request, response) => {
    if (request.method === 'GET') {
        response.status(200).json(products);
    } else {
        throw new Error(`Method ${request.method} not allowed`);
    }
};
