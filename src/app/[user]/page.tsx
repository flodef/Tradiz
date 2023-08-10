import { Metadata } from 'next';
import { metadata } from '../layout';
import Home from '../page';

type Props = {
    params: { user: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return {
        title: metadata.title + ' - ' + params.user.charAt(0).toUpperCase() + params.user.slice(1),
        description: metadata.description,
    };
}

export default async function Page({ params }: Props) {
    return Home(params.user);
}
