import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enableTailwind } from '@remotion/tailwind-v4';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Webpack override for the Remotion bundler:
 *  - Tailwind v4 (the app is CSS-first Tailwind via @tailwindcss/postcss),
 *    so slide templates render with the same utility classes as in Next.
 *  - `@/` path alias matching tsconfig's `@/* -> ./src/*`.
 */
export const webpackOverride = (config) => {
  const withTailwind = enableTailwind(config);
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...(withTailwind.resolve?.alias ?? {}),
        '@': path.join(projectRoot, 'src'),
      },
    },
  };
};
