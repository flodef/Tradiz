import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const sheetName = searchParams.get('sheetName');

    if (!process.env.GOOGLE_API_KEY)
        return NextResponse.json({ error: 'Google API key not found in environment variables' });
    if (!sheetName) return NextResponse.json({ error: 'Sheet name not found in query parameters' });
    if (!id && sheetName === 'index' && !process.env.INDEX_SPREADSHEET_ID)
        return NextResponse.json({ error: 'Index spreadsheet id not found in environment variables' });
    if (!id && sheetName !== 'index' && !process.env.SHOP_SPREADSHEET_ID)
        return NextResponse.json({ error: 'Shop spreadsheet id not found in environment variables' });

    const spreadsheetId =
        id || (sheetName === 'index' ? process.env.INDEX_SPREADSHEET_ID : process.env.SHOP_SPREADSHEET_ID);
    const isRaw = searchParams.get('isRaw') === 'true';
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A%3AZ?${isRaw ? 'valueRenderOption=UNFORMATTED_VALUE&' : ''}key=${
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
