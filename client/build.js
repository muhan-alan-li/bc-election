import {
    mkdir,
    readFile,
    writeFile,
    rm,
    rename,
    readdir,
    mkdtemp,
} from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { exportSiteData } from './scripts/export-site-data.mjs';
import { exportFinder } from './scripts/export-finder.mjs';

const watch = process.argv.includes('--watch');
const staticOutput = process.env.BC_STATIC_OUTPUT || 'dist-static';
const output = watch ? staticOutput : await mkdtemp('.static-build-');
const electionID = process.env.BC_ELECTION_ID || 'bc-provincial-2026';
const publishedDir = path.resolve(
    process.env.BC_PUBLISHED_DIR || '../ingestion/storage/published',
);
const contentDir = path.resolve(process.env.BC_CONTENT_DIR || '../content');
const finderDataset = path.resolve(
    process.env.BC_FINDER_DATASET || path.join(publishedDir, 'finder.json'),
);

try {
    const publication = await exportSiteData({
        publishedDir,
        contentDir,
        electionID,
        output,
    });
    const finder = await exportFinder({
        dataset: finderDataset,
        catalog: path.join(output, 'data/districts.json'),
        output,
    });
    console.log(
        `Exported ${publication.districts} constituencies and ${finder.postal} postal codes.`,
    );

    await mkdir(`${output}/assets`, { recursive: true });
    const worker = await esbuild.build({
        entryPoints: { 'finder-worker': 'src/workers/finder.worker.js' },
        bundle: true,
        format: 'esm',
        minify: !watch,
        metafile: true,
        outdir: `${output}/assets`,
        entryNames: '[name]-[hash]',
        target: ['es2022'],
    });
    const workerFile = Object.keys(worker.metafile.outputs).find((file) =>
        file.endsWith('.js'),
    );
    const finderWorkerURL = `/${path
        .relative(output, workerFile)
        .split(path.sep)
        .join('/')}`;

    // Retain hashed assets across builds so open tabs can still load their chunks.
    for (const name of ['app.js', 'app.css', 'app.js.map', 'app.css.map']) {
        await rm(`${output}/${name}`, { force: true });
    }
    if (!watch) {
        for (const entry of await readdir(`${output}/assets`, {
            recursive: true,
        })) {
            if (entry.endsWith('.map'))
                await rm(path.join(`${output}/assets`, entry), { force: true });
        }
    }

    const options = {
        entryPoints: { app: 'src/main.jsx' },
        bundle: true,
        splitting: true,
        format: 'esm',
        outdir: `${output}/assets`,
        entryNames: '[name]-[hash]',
        chunkNames: 'chunks/[name]-[hash]',
        jsx: 'automatic',
        jsxImportSource: 'preact',
        sourcemap: watch,
        minify: !watch,
        metafile: true,
        target: ['es2022'],
        define: {
            __FINDER_WORKER_URL__: JSON.stringify(finderWorkerURL),
        },
        loader: { '.png': 'dataurl' },
        plugins: [
            {
                name: 'client-html',
                setup(build) {
                    build.onEnd(async (result) => {
                        if (result.errors.length) return;
                        const [entry, meta] = Object.entries(
                            result.metafile.outputs,
                        ).find(
                            ([, output]) =>
                                output.entryPoint === 'src/main.jsx',
                        );
                        const url = (file) =>
                            `/${path
                                .relative(output, file)
                                .split(path.sep)
                                .join('/')}`;
                        const template = await readFile('index.html', 'utf8');
                        const html = template
                            .replace('/app.js', url(entry))
                            .replace('/app.css', url(meta.cssBundle));
                        // Replace the document after all referenced assets have been written.
                        await writeFile(`${output}/.index.html.tmp`, html);
                        await rename(
                            `${output}/.index.html.tmp`,
                            `${output}/index.html`,
                        );
                    });
                },
            },
        ],
    };
    if (watch) {
        const context = await esbuild.context(options);
        await context.watch();
        console.log(
            `Watching client files. Preview ${path.resolve(staticOutput)} with a static server.`,
        );
    } else {
        await esbuild.build(options);
        await writeFile(
            path.join(output, '_headers'),
            await readFile('static/_headers'),
        );
        await rm(staticOutput, { recursive: true, force: true });
        await rename(output, staticOutput);
        console.log(`Static site ready in ${path.resolve(staticOutput)}.`);
    }
} finally {
    if (!watch) await rm(output, { recursive: true, force: true });
}
