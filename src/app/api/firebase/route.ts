import { NextResponse } from 'next/server';

export async function GET() {
    const apiKey = process.env.FIREBASE_API_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const appId = process.env.FIREBASE_APP_ID;

    if (!apiKey || !projectId || !appId) return NextResponse.json({});

    return NextResponse.json({
        apiKey: apiKey,
        authDomain: projectId + '.firebaseapp.com',
        projectId: projectId,
        storageBucket: projectId + '.appspot.com',
        messagingSenderId: appId.split(':')[1],
        appId: appId,
    });
}
