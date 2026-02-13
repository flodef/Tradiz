import mysql from 'mysql2/promise';
import { POS } from '@/app/utils/constants';

export type Connection = mysql.Connection;

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
};

export function getMainDb() {
    return mysql.createConnection({
        ...dbConfig,
        database: process.env.DB_NAME,
    });
}

export function getPosDb() {
    return mysql.createConnection({
        ...dbConfig,
        database: process.env.DB_NAME + '_' + POS,
    });
}
