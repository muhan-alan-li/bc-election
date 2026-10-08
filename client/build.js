import { mkdir, copyFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';

await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');

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
