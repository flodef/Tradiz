import { beforeEach } from 'vitest';
import { invalidateApiCache } from '../src/app/api/sql/apiCache';

// The api cache is module-level state — flush it between tests so a value
// cached by one test (e.g. an active subscription) can't leak into the next.
beforeEach(() => invalidateApiCache());
