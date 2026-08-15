/* =========================
   RESOURCES
   ========================= */

function resourceURL(path) {
    return new URL(
        path,
        BASE_PATH
    ).href;
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
