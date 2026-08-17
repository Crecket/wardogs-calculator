import { cp, mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = join(root, 'dist');

const sourceDirs = ['assets', 'config', 'data', 'js', 'locales', 'maps'];
const sourceFiles = ['style.css', 'robots.txt', 'sitemap.xml', 'CNAME', 'LICENSE'];

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

async function copyIfExists(source, target) {
    if (!(await exists(source))) return;
    await cp(source, target, { recursive: true });
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const dir of sourceDirs) {
    await copyIfExists(join(root, dir), join(dist, dir));
}

for (const file of sourceFiles) {
    await copyIfExists(join(root, file), join(dist, file));
}

await copyIfExists(
    join(root, 'src', 'pages', 'index.html'),
    join(dist, 'index.html')
);

const localizedDir = join(root, 'src', 'pages', 'locales');

if (await exists(localizedDir)) {
    const files = await readdir(localizedDir);

    for (const file of files) {
        if (!file.endsWith('.html')) continue;

        const lang = file.slice(0, -5);
        const targetDir = join(dist, lang);

        await mkdir(targetDir, { recursive: true });
        await cp(
            join(localizedDir, file),
            join(targetDir, 'index.html')
        );
    }
}

console.log(`Built static site into ${dist}`);
