import { getShopIdFromRequest } from '@/app/constants/shop';
import { NextResponse } from 'next/server';
import { getMainDb, DbConnection } from '../db';

export const dynamic = 'force-dynamic';

interface ThemeRow {
    name: string;
    selected?: boolean | number;
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

interface ThemeColor {
    label: string;
    light: string;
    dark: string;
}

const SELECT_COLUMNS = `
                name,
                selected,
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
                secondary_activated_dark`;

function rowToColors(row: ThemeRow): ThemeColor[] {
    return [
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

// MariaDB returns 0/1, PostgreSQL returns booleans.
function isSelected(row: ThemeRow): boolean {
    return row.selected === true || row.selected === 1;
}

export async function GET(request: Request) {
    const shopId = getShopIdFromRequest(request);
    // `all=1` returns every theme so the admin config page can list and pick them.
    // The default response stays a single (selected) theme, which is what the app applies.
    const returnAll = new URL(request.url).searchParams.get('all') === '1';
    let connection: DbConnection | undefined;
    try {
        connection = await getMainDb(shopId);

        const query = `
            SELECT${SELECT_COLUMNS}
            FROM
                theme_admin
            ${returnAll ? 'ORDER BY id' : 'WHERE selected = true'}
        `;

        const [rows] = await connection.execute(query);
        const allRows = rows as ThemeRow[];

        if (returnAll) {
            const selectedIndex = allRows.findIndex(isSelected);
            return NextResponse.json(
                {
                    colors: allRows.flatMap(rowToColors),
                    themeNames: allRows.map((row) => String(row.name)),
                    selectedThemeIndex: selectedIndex === -1 ? 0 : selectedIndex,
                },
                { status: 200 }
            );
        }

        const data: { colors: ThemeColor[]; themeName?: string } = { colors: [] };

        if (allRows.length > 0) {
            data.themeName = String(allRows[0].name);
            data.colors = rowToColors(allRows[0]);
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Error fetching colors:', error);
        return NextResponse.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    } finally {
        await connection?.end();
    }
}
