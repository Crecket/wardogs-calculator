/* =========================
   IMAGE DECODE
   ========================= */

/*
 * One decode path for every raster the map draws: the tile pyramid and the
 * baked hillshade.
 *
 * Same-origin images go through fetch + createImageBitmap, which decodes off
 * the main thread and hands back a bitmap the canvas can blit without a
 * further copy. Anything else — a cross-origin URL, a browser without
 * createImageBitmap, a fetch or a decode that fails — falls back to an <img>
 * element, which every browser can draw.
 */

function mapImageIsSameOrigin(url) {
    try {
        return new URL(url, location.href).origin === location.origin;
    } catch (error) {
        return false;
    }
}

function decodeMapImageElement(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.decoding = 'async';

        image.onload = () => {
            if (typeof image.decode !== 'function') {
                resolve(image);

                return;
            }

            image.decode().then(
                () => resolve(image),
                () => resolve(image)
            );
        };

        image.onerror = () => reject(new Error(url));

        image.src = url;
    });
}

async function decodeMapImage(url) {
    if (
        typeof createImageBitmap !== 'function' ||
        typeof fetch !== 'function' ||
        !mapImageIsSameOrigin(url)
    ) {
        return decodeMapImageElement(url);
    }

    let response = null;

    try {
        response = await fetch(url);
    } catch (error) {
        return decodeMapImageElement(url);
    }

    if (!response.ok) {
        throw new Error(`${url}: ${response.status}`);
    }

    try {
        return await createImageBitmap(await response.blob());
    } catch (error) {
        return decodeMapImageElement(url);
    }
}
