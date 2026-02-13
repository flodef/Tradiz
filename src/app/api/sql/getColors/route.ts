import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

export async function GET() {
    try {
        const connection = await getMainDb();

        const query = `
            SELECT
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
                selected = 1
        `;

        const [rows] = await connection.execute(query);
        await connection.end();

        const allRows = rows as any[];

        const data: { values: string[][] } = { values: [] };
        data.values.push(['Couleur', 'Clair', 'Sombre']);

        if (allRows.length > 0) {
            const row = allRows[0];
            data.values.push(
                ['Texte', String(row.text_light), String(row.text_dark)],
                ['Fond début dégradé', String(row.gradient_start_light), String(row.gradient_start_dark)],
                ['Fond fin dégradé', String(row.gradient_end_light), String(row.gradient_end_dark)],
                ['Popup', String(row.popup_light), String(row.popup_dark)],
                ['Activé', String(row.activated_light), String(row.activated_dark)],
                ['Secondaire', String(row.secondary_light), String(row.secondary_dark)],
                ['Secondaire activé', String(row.secondary_activated_light), String(row.secondary_activated_dark)]
            );
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Error fetching colors:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}
