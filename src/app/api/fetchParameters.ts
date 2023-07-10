import { NextApiHandler } from 'next';
import parameters from '../data/parameters.json';

export const fetchParameters: NextApiHandler = async (request, response) => {
    if (request.method === 'GET') {
        response.status(200).json(parameters);
    } else {
        throw new Error(`Method ${request.method} not allowed`);
    }
};
