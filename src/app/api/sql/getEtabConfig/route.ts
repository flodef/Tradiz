import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getMainDb } from '../db';

type OperationMode = 'restaurant' | 'fastfood' | 'light';

interface EtabConfigRow extends RowDataPacket {
    mode_fonctionnement: OperationMode | null;
    kitchen_view_enabled: number | null;
    grafana_access_enabled: number | null;
}

export async function GET() {
    try {
        const connection = await getMainDb();

        const [rows] = await connection.execute(
            'SELECT mode_fonctionnement, kitchen_view_enabled, grafana_access_enabled FROM config_etablissement ORDER BY id DESC LIMIT 1'
        );
        await connection.end();

        const row = (rows as EtabConfigRow[])[0];
        const mode =
            row?.mode_fonctionnement === 'fastfood' || row?.mode_fonctionnement === 'light'
                ? row.mode_fonctionnement
                : 'restaurant';
        const kitchenViewEnabled = mode === 'light' ? false : Number(row?.kitchen_view_enabled ?? 1) === 1;
        const grafanaAccessEnabled = Number(row?.grafana_access_enabled ?? 1) === 1;

        return NextResponse.json(
            {
                mode_fonctionnement: mode,
                kitchen_view_enabled: kitchenViewEnabled,
                grafana_access_enabled: grafanaAccessEnabled,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('getEtabConfig error:', error);
        return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
    }
}
