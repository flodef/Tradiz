import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const sheetName = searchParams.get('sheetName');
    if (!process.env.GOOGLE_API_KEY || (!process.env.GOOGLE_SPREADSHEET_ID && !id) || !sheetName)
        return NextResponse.json({});

    const isRaw = searchParams.get('isRaw') === 'true';
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${
            id || process.env.GOOGLE_SPREADSHEET_ID
        }/values/${sheetName}!A%3AZ?${isRaw ? 'valueRenderOption=UNFORMATTED_VALUE&' : ''}key=${
            process.env.GOOGLE_API_KEY
        }`,
        {
            headers: {
                Referer: 'https://www.fims.fi',
                ContentType: 'application/json',
            },
        }
    );
    const data = await response.json();

    return NextResponse.json(data);
}
