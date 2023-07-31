import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    if (process.env.GOOGLE_SPREADSHEET_ID && process.env.GOOGLE_API_KEY) {
        const { searchParams } = new URL(request.url);
        const sheetName = searchParams.get('sheetName');
        const isRaw = searchParams.get('isRaw') === 'true';
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${
                process.env.GOOGLE_SPREADSHEET_ID
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
    } else {
        return NextResponse.json({});
    }
}
