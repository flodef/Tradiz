'use client';

import GlobalError from './global-error';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
    return GlobalError({ error, reset });
}
