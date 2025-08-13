'use server';

import { db } from '@/utils/firebase';
import {
    collection,
    getDocs,
    doc,
    setDoc,
    DocumentData,
} from 'firebase/firestore';

export interface Config {
    [key: string]: DocumentData;
}

export async function getShopConfig(shopName: string): Promise<Config> {
    const configCollection = collection(db, `Config_${shopName}`);
    const snapshot = await getDocs(configCollection);
    const config: Config = {};
    snapshot.forEach((doc) => {
        config[doc.id] = doc.data();
    });
    return config;
}

export async function updateConfigTheme(
    shopName: string,
    theme: string,
    data: any
) {
    const configDoc = doc(db, `Config_${shopName}`, theme);
    await setDoc(configDoc, data, { merge: true });
}
