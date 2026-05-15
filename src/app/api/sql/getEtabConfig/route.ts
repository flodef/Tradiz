import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getMainDb } from '../db';

type OperationMode = 'restaurant' | 'fastfood' | 'lite';

interface EtabConfigRow extends RowDataPacket {
    operation_mode: OperationMode | null; // PostgreSQL
    mode_fonctionnement: OperationMode | null; // MariaDB
    kitchen_view_enabled: number | boolean | null;
    grafana_access_enabled: number | boolean | null;
}

const SAFE_DEFAULTS = {
    mode_fonctionnement: 'restaurant' as OperationMode,
    kitchen_view_enabled: false,
    grafana_access_enabled: false,
};

export async function GET() {
    try {
        const connection = await getMainDb();

        const query = connection.isPostgreSQL
            ? 'SELECT operation_mode, kitchen_view_enabled, grafana_access_enabled FROM establishment_config ORDER BY id DESC LIMIT 1'
            : 'SELECT mode_fonctionnement, kitchen_view_enabled, grafana_access_enabled FROM config_etablissement ORDER BY id DESC LIMIT 1';

        const [rows] = await connection.execute(query);
        await connection.end();

        const row = (rows as EtabConfigRow[])[0];
        if (!row) return NextResponse.json(SAFE_DEFAULTS, { status: 200 });

        const rawMode = row.operation_mode ?? row.mode_fonctionnement;
        const mode: OperationMode = rawMode === 'fastfood' || rawMode === 'lite' ? rawMode : 'restaurant';
        const kitchenViewEnabled = mode === 'lite' ? false : Number(row.kitchen_view_enabled ?? 0) === 1;
        const grafanaAccessEnabled = Number(row.grafana_access_enabled ?? 0) === 1;

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
        return NextResponse.json(SAFE_DEFAULTS, { status: 200 });
    }
}
