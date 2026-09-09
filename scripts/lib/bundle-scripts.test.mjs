import test from 'node:test';
import assert from 'node:assert/strict';
import { concatenateScripts, findScriptRuns, replaceScriptRuns } from './bundle-scripts.mjs';

const page = [
    '<head>',
    '<script src="js/core/mobile-redirect.js"></script>',
    '<script defer src="https://cloud.umami.is/script.js"></script>',
    '</head>',
    '<body>',
    '<script src="js/core/core.js"></script>',
    '<script src="js/features/guns.js"></script>',
    '',
    '<script src="js/main.js"></script>',
    '</body>'
].join('\n');

test('a lone head script is left alone and the body list is one run', () => {
    const runs = findScriptRuns(page);

    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].sources, ['js/core/core.js', 'js/features/guns.js', 'js/main.js']);
});

test('the run collapses to a single deferred bundle tag', () => {
    const runs = findScriptRuns(page);
    const output = replaceScriptRuns(page, runs, 'js/bundles/app.js');

    assert.equal(output.match(/<script/g).length, 3);
    assert.match(output, /<script defer src="js\/bundles\/app\.js"><\/script>\n<\/body>/);
    assert.match(output, /<script src="js\/core\/mobile-redirect\.js"><\/script>/);
    assert.doesNotMatch(output, /js\/main\.js/);
});

test('scripts are joined in order with a statement break between them', () => {
    const bundle = concatenateScripts([
        { path: 'js/a.js', code: 'const a = 1\n' },
        { path: 'js/b.js', code: '(() => { b(a); })()' }
    ]);

    assert.match(bundle, /const a = 1\n;\n\/\* js\/b\.js \*\/\n\(\(\) => \{ b\(a\); \}\)\(\)\n;/);
});

test('a top-level use strict directive is rejected', () => {
    assert.throws(
        () => concatenateScripts([{ path: 'js/strict.js', code: "'use strict';\nvar x = 1;" }]),
        /use strict/
    );
});
