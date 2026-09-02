/* =========================
   RESOURCES
   ========================= */

let ASSET_VERSION;

function assetVersion() {
    if (ASSET_VERSION === undefined) {
        ASSET_VERSION =
            typeof document === 'object'
                ? document
                    .querySelector('meta[name="asset-version"]')
                    ?.getAttribute('content') || null
                : null;
    }

    return ASSET_VERSION;
}

function resourceURL(path) {
    const url = new URL(
        path,
        BASE_PATH
    );

    const version = assetVersion();

    if (version && !url.searchParams.has('v')) {
        url.searchParams.set('v', version);
    }

    return url.href;
}

async function fetchJSON(path) {

    const url =
        resourceURL(path);

    const response =
        await fetch(
            url,
            {
                cache: 'no-cache'
            }
        );

    if (!response.ok) {
        throw new Error(
            `Failed to load ${url}: ${response.status} ${response.statusText}`
        );
    }

    return response.json();
}
