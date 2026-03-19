import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            'inclusive-shortcuts': resolve(rootDir, 'src/index.ts'),
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: resolve(rootDir, 'test/setup.ts'),
    },
    build: {
        lib: {
            entry: resolve(rootDir, 'src/index.ts'),
            formats: ['es'],
            fileName: 'inclusive-shortcuts',
        },
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name]-[hash].js',
            },
        },
    },
});
