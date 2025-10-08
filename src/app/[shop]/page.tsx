import { Metadata } from 'next';
import { metadata } from '../layout';
import Home from '../page';
import { SearchParams } from 'next/dist/server/request/search-params';

type Props = {
    params: Promise<{ shop: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { shop } = await params;
    return {
        title: metadata.title + ' - ' + shop.charAt(0).toUpperCase() + shop.slice(1),
        description: metadata.description,
    };
}

export default async function Page({ params, searchParams }: Props) {
    const { shop } = await params;
    const { orderId } = await searchParams;
    return Home({ params: { shop }, searchParams: { orderId } });
}
