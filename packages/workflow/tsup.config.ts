import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/engines/index.ts',
    'src/events/index.ts',
    'src/plugins/index.ts',
    'src/types/index.ts',
    'src/landing-pages/blocks/index.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
