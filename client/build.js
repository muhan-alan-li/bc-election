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
import { execFileSync } from 'node:child_process';

const watch = process.argv.includes('--watch');
const staticSite = process.argv.includes('--static');
if (watch && staticSite)
    throw new Error('Static builds do not support --watch');
const staticOutput = process.env.BC_STATIC_OUTPUT || 'dist-static';
const output = staticSite ? await mkdtemp('.static-build-') : 'dist';
try {
    if (staticSite) {
        execFileSync(
            'go',
            [
                'run',
                './cmd/export-static',
                '-data-dir',
                path.resolve(
                    process.env.BC_PUBLISHED_DIR ||
                        '../ingestion/storage/published',
                ),
                '-content-dir',
                path.resolve('../content-server/content'),
                '-election',
                process.env.BC_ELECTION_ID || 'bc-provincial-2026',
                '-out',
                path.resolve(output),
            ],
            { cwd: '../content-server', stdio: 'inherit' },
        );
    }
    await mkdir(`${output}/assets`, { recursive: true });
    let finderWorkerURL = null;
    if (staticSite) {
        execFileSync(
            'go',
            [
                'run',
                './cmd/export-static',
                '-dataset',
                path.resolve(
                    process.env.BC_FINDER_DATASET ||
                        '../ingestion/storage/published/finder.json',
                ),
                '-catalog',
                path.resolve(output, 'data/districts.json'),
                '-out',
                path.resolve(output),
            ],
            { cwd: '../constituency-finder', stdio: 'inherit' },
        );
        const worker = await esbuild.build({
            entryPoints: { 'finder-worker': 'src/workers/finder.worker.js' },
            bundle: true,
            format: 'esm',
            minify: true,
            metafile: true,
            outdir: `${output}/assets`,
            entryNames: '[name]-[hash]',
            target: ['es2022'],
        });
        const file = Object.keys(worker.metafile.outputs).find((file) =>
            file.endsWith('.js'),
        );
        finderWorkerURL = `/${path.relative(output, file).split(path.sep).join('/')}`;
    }
    await rm(`${output}/data/political`, { recursive: true, force: true });
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
            __STATIC_SITE__: JSON.stringify(staticSite),
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
                            `/${path.relative(output, file).split(path.sep).join('/')}`;
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
            'Watching client files. Start the Go server at http://localhost:8000',
        );
    } else {
        await esbuild.build(options);
    }

    if (staticSite) {
        await writeFile(
            path.join(output, '_headers'),
            await readFile('static/_headers'),
        );
        await rm(staticOutput, { recursive: true, force: true });
        await rename(output, staticOutput);
        console.log(
            `Static site ready in ${path.resolve(staticOutput)} (no backend required).`,
        );
    }
} finally {
    if (staticSite) await rm(output, { recursive: true, force: true });
}
