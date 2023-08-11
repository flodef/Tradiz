import { Metadata } from 'next';
import { metadata } from '../layout';
import Home from '../page';

type Props = {
    params: { shop: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return {
        title: metadata.title + ' - ' + params.shop.charAt(0).toUpperCase() + params.shop.slice(1),
        description: metadata.description,
    };
}

export default async function Page({ params }: Props) {
    return Home(params.shop);
}
