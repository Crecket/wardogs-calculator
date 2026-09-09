const LOCAL_SCRIPT_TAG =
    /<script src="(js\/[^"?#]+\.js)"><\/script>/g;

export function findScriptRuns(html, minimum = 2) {
    const runs = [];
    let current = null;

    for (const match of html.matchAll(LOCAL_SCRIPT_TAG)) {
        const start = match.index;
        const end = start + match[0].length;

        if (
            current &&
            /^\s*$/.test(html.slice(current.end, start))
        ) {
            current.end = end;
            current.sources.push(match[1]);
            continue;
        }

        current = { start, end, sources: [match[1]] };
        runs.push(current);
    }

    return runs.filter(run => run.sources.length >= minimum);
}

export function concatenateScripts(sources) {
    for (const { path, code } of sources) {
        if (/^\s*(['"])use strict\1\s*;/.test(code)) {
            throw new Error(
                `${path} has a top-level "use strict" directive, which would apply to the whole bundle`
            );
        }
    }

    return sources
        .map(({ path, code }) => `/* ${path} */\n${code.trim()}\n;`)
        .join('\n') + '\n';
}

export function replaceScriptRuns(html, runs, bundlePath) {
    let output = html;

    for (const run of [...runs].reverse()) {
        output =
            output.slice(0, run.start) +
            `<script defer src="${bundlePath}"></script>` +
            output.slice(run.end);
    }

    return output;
}
