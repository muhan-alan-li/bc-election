import { mkdir, copyFile, rm } from 'node:fs/promises';
import * as esbuild from 'esbuild';

await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
// Retire snapshots from the previous build pipeline. Research now comes from
// validated backend endpoints and must not remain in the public asset folder.
await rm('dist/data/political', { recursive: true, force: true });
await rm('dist/assets', { recursive: true, force: true });

const options = {
    entryPoints: ['src/main.jsx'],
    bundle: true,
    outfile: 'dist/app.js',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    sourcemap: true,
    target: ['es2022'],
    loader: { '.png': 'dataurl' },
};

if (process.argv.includes('--watch')) {
    const context = await esbuild.context(options);
    await context.watch();
    console.log(
        'Watching client files. Start the Go server and open http://localhost:8000',
    );
} else {
    await esbuild.build(options);
}
