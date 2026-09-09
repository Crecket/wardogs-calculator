import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { concatenateScripts, findScriptRuns, replaceScriptRuns } from './lib/bundle-scripts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

async function htmlFiles(directory) {
    const output = [];

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);

        if (entry.isDirectory()) output.push(...await htmlFiles(path));
        else if (entry.name.endsWith('.html')) output.push(path);
    }

    return output;
}

function bundleName(page) {
    const directory = dirname(relative(dist, page)).replaceAll('\\', '/');

    return directory === '.' ? 'app' : directory.replaceAll('/', '-');
}

await mkdir(join(dist, 'js', 'bundles'), { recursive: true });

for (const page of await htmlFiles(dist)) {
    const html = await readFile(page, 'utf8');
    const runs = findScriptRuns(html);

    if (!runs.length) continue;

    if (runs.length > 1) {
        throw new Error(`${relative(dist, page)} has ${runs.length} separate script lists`);
    }

    const [run] = runs;
    const sources = [];

    for (const path of run.sources) {
        sources.push({ path, code: await readFile(join(dist, path), 'utf8') });
    }

    const bundlePath = `js/bundles/${bundleName(page)}.js`;

    await writeFile(join(dist, bundlePath), concatenateScripts(sources), 'utf8');
    await writeFile(page, replaceScriptRuns(html, runs, bundlePath), 'utf8');

    console.log(`Bundled ${run.sources.length} scripts from ${relative(dist, page)} into ${bundlePath}`);
}
