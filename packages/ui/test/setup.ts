import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// The suite does not enable Vitest globals, so Testing Library's automatic afterEach cleanup
// never registers. Without it, rendered trees accumulate across tests in a file and role/text
// queries find duplicates. Register cleanup explicitly.
afterEach(() => {
  cleanup();
});
