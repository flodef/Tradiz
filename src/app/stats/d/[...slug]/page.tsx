import { USE_DIGICARTE } from '@/app/utils/constants';
import { redirect } from 'next/navigation';

export default function StatsDashboardPage() {
    if (!USE_DIGICARTE) redirect('/stats');

    return null;
}
