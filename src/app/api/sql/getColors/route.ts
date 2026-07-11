import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface ThemeRow {
    name: string;
    text_light: string;
    text_dark: string;
    gradient_start_light: string;
    gradient_start_dark: string;
    gradient_end_light: string;
    gradient_end_dark: string;
    popup_light: string;
    popup_dark: string;
    activated_light: string;
    activated_dark: string;
    secondary_light: string;
    secondary_dark: string;
    secondary_activated_light: string;
    secondary_activated_dark: string;
}

export async function GET() {
    try {
        const connection = await getMainDb();

        const query = `
            SELECT
                name,
                text_light,
                text_dark,
                gradient_start_light,
                gradient_start_dark,
                gradient_end_light,
                gradient_end_dark,
                popup_light,
                popup_dark,
                activated_light,
                activated_dark,
                secondary_light,
                secondary_dark,
                secondary_activated_light,
                secondary_activated_dark
            FROM
                theme_admin
            WHERE
                selected = true
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const allRows = rows as ThemeRow[];

        const data: { colors: { label: string; light: string; dark: string }[]; themeName?: string } = {
            colors: [],
        };

        if (allRows.length > 0) {
            const row = allRows[0];
            data.themeName = String(row.name);
            data.colors = [
                { label: 'Texte', light: String(row.text_light), dark: String(row.text_dark) },
                {
                    label: 'Fond début dégradé',
                    light: String(row.gradient_start_light),
                    dark: String(row.gradient_start_dark),
                },
                {
                    label: 'Fond fin dégradé',
                    light: String(row.gradient_end_light),
                    dark: String(row.gradient_end_dark),
                },
                { label: 'Popup', light: String(row.popup_light), dark: String(row.popup_dark) },
                { label: 'Activé', light: String(row.activated_light), dark: String(row.activated_dark) },
                { label: 'Secondaire', light: String(row.secondary_light), dark: String(row.secondary_dark) },
                {
                    label: 'Secondaire activé',
                    light: String(row.secondary_activated_light),
                    dark: String(row.secondary_activated_dark),
                },
            ];
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Error fetching colors:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
