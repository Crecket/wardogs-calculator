import { createHash, createHmac } from 'node:crypto';

/*
 * Minimal AWS Signature Version 4 signing, enough for R2's S3 API.
 *
 * Hand-rolled rather than pulled from @aws-sdk/client-s3 because this repo
 * has no runtime or build dependencies and that is worth keeping — the SDK
 * would add several hundred packages to a project that currently installs
 * nothing.
 *
 * Verified against the AWS SigV4 test suite in scripts/lib/sigv4.test.mjs.
 */

export function sha256Hex(value) {
    return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
    return createHmac('sha256', key).update(value).digest();
}

/*
 * Each path segment is encoded separately so that the slashes separating
 * them survive. S3 canonicalisation also requires the stricter RFC 3986 set
 * than encodeURIComponent applies, hence the extra replacements.
 */
export function encodeS3Path(path) {
    return path
        .split('/')
        .map(segment =>
            encodeURIComponent(segment)
                .replace(/[!'()*]/g, char =>
                    '%' + char.charCodeAt(0).toString(16).toUpperCase()
                )
        )
        .join('/');
}

function canonicalHeaders(headers) {
    const entries = Object.entries(headers)
        .map(([name, value]) => [
            name.toLowerCase(),
            String(value).trim().replace(/\s+/g, ' ')
        ])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return {
        canonical: entries
            .map(([name, value]) => `${name}:${value}\n`)
            .join(''),
        signed: entries.map(([name]) => name).join(';')
    };
}

function canonicalQuery(query) {
    return Object.entries(query)
        .map(([key, value]) => [
            encodeURIComponent(key),
            encodeURIComponent(value ?? '')
        ])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
}

export function signingKey({ secretAccessKey, date, region, service }) {
    return hmac(
        hmac(
            hmac(
                hmac(`AWS4${secretAccessKey}`, date),
                region
            ),
            service
        ),
        'aws4_request'
    );
}

/*
 * Returns the headers to send, including Authorization. `payloadHash` is
 * the hex SHA-256 of the body; callers that stream may pass
 * 'UNSIGNED-PAYLOAD'.
 */
export function signRequest({
    method,
    url,
    headers = {},
    query = {},
    payloadHash,
    accessKeyId,
    secretAccessKey,
    region = 'auto',
    service = 's3',
    now = new Date(),

    /*
     * S3 requires x-amz-content-sha256; the published AWS test vectors do
     * not carry it. Making it optional is what lets sigv4.test.mjs check
     * this implementation against those vectors byte for byte.
     */
    contentSha256Header = true
}) {
    const target = new URL(url);

    const amzDate = now
        .toISOString()
        .replace(/[:-]|\.\d{3}/g, '');

    const date = amzDate.slice(0, 8);

    const allHeaders = {
        ...headers,
        host: target.host,
        ...(contentSha256Header
            ? { 'x-amz-content-sha256': payloadHash }
            : {}),
        'x-amz-date': amzDate
    };

    const { canonical, signed } = canonicalHeaders(allHeaders);

    const canonicalRequest = [
        method,
        encodeS3Path(target.pathname),
        canonicalQuery(query),
        canonical,
        signed,
        payloadHash
    ].join('\n');

    const scope = `${date}/${region}/${service}/aws4_request`;

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        scope,
        sha256Hex(canonicalRequest)
    ].join('\n');

    const signature = createHmac(
        'sha256',
        signingKey({ secretAccessKey, date, region, service })
    )
        .update(stringToSign)
        .digest('hex');

    return {
        ...allHeaders,
        Authorization:
            `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
            `SignedHeaders=${signed}, Signature=${signature}`
    };
}
