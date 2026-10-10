import { mkdir, copyFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';
import { preparePoliticalAssets } from './build/political-assets.js';

let politicalCatalog;

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
    loader: { '.png': 'dataurl', '.jpg': 'file' },
    assetNames: 'assets/[name]-[hash]',
    plugins: [
        {
            name: 'political-profiles',
            setup(build) {
                build.onStart(async () => {
                    politicalCatalog = await preparePoliticalAssets(
                        '../ingestion/storage/published/political',
                        'dist',
                        process.env.ELECTION_ID || 'bc-provincial-2026',
                    );
                });
                build.onResolve(
                    { filter: /^political-profile-catalog$/ },
                    () => ({ path: 'catalog', namespace: 'political' }),
                );
                build.onLoad({ filter: /.*/, namespace: 'political' }, () => ({
                    contents: JSON.stringify(politicalCatalog),
                    loader: 'json',
                    watchFiles: ['candidates', 'parties'].flatMap((kind) =>
                        Object.keys(politicalCatalog[kind]).map(
                            (id) =>
                                `../ingestion/storage/published/political/${politicalCatalog.electionID}/${kind}/${id}.json`,
                        ),
                    ),
                    watchDirs: ['candidates', 'parties'].map(
                        (kind) =>
                            `../ingestion/storage/published/political/${politicalCatalog.electionID}/${kind}`,
                    ),
                }));
            },
        },
    ],
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
