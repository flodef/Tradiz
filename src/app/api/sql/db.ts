import mysql, { Connection } from 'mysql2/promise';
import { POS } from '@/app/utils/constants';

export type { Connection };

const baseConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
};

export function getMainDb() {
    return mysql.createConnection({
        ...baseConfig,
        database: process.env.DB_NAME,
    });
}

export function getPosDb() {
    return mysql.createConnection({
        ...baseConfig,
        database: process.env.DB_NAME + '_' + POS,
    });
}
