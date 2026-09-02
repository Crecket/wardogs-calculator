/*
 * Checks the hand-rolled SigV4 implementation against AWS's own published
 * values. Run with: node --test scripts/lib/
 *
 * These vectors are the reason it is safe to sign requests without the AWS
 * SDK: a signing bug produces a 403 from R2 with no hint as to which of the
 * canonical request, scope or key derivation was wrong, so the arithmetic is
 * pinned to known-good numbers here rather than debugged over the network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encodeS3Path, sha256Hex, signRequest, signingKey } from './sigv4.mjs';

test('sha256Hex matches the known empty-string digest', () => {
    assert.equal(
        sha256Hex(''),
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
});

/*
 * AWS documentation, "Examples of how to derive a signing key":
 * secret wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY, 20120215, us-east-1, iam.
 */
test('signing key derivation matches the AWS worked example', () => {
    const key = signingKey({
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        date: '20120215',
        region: 'us-east-1',
        service: 'iam'
    });

    assert.equal(
        key.toString('hex'),
        'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d'
    );
});

/*
 * aws4_testsuite / get-vanilla: the canonical end-to-end case.
 */
test('get-vanilla produces the documented signature', () => {
    const headers = signRequest({
        method: 'GET',
        url: 'https://example.amazonaws.com/',
        payloadHash: sha256Hex(''),
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
        service: 'service',
        now: new Date('2015-08-30T12:36:00Z'),
        contentSha256Header: false
    });

    assert.equal(
        headers.Authorization,
        'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31'
    );
});

/*
 * aws4_testsuite / get-vanilla-query-order-key-case: proves query parameters
 * are sorted and encoded the way the canonical request requires.
 */
test('query parameters are canonically ordered', () => {
    const headers = signRequest({
        method: 'GET',
        url: 'https://example.amazonaws.com/',
        query: { Param2: 'value2', Param1: 'value1' },
        payloadHash: sha256Hex(''),
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
        service: 'service',
        now: new Date('2015-08-30T12:36:00Z'),
        contentSha256Header: false
    });

    assert.equal(
        headers.Authorization,
        'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500'
    );
});

test('S3 path encoding keeps separators and escapes the rest', () => {
    assert.equal(encodeS3Path('/bakurani/zoom_2/3_0.webp'), '/bakurani/zoom_2/3_0.webp');
    assert.equal(encodeS3Path('/a b/c+d'), '/a%20b/c%2Bd');
    assert.equal(encodeS3Path('/it(1)/x!y'), '/it%281%29/x%21y');
    assert.equal(encodeS3Path('/'), '/');
});

test('signed headers include the S3 payload hash by default', () => {
    const headers = signRequest({
        method: 'PUT',
        url: 'https://acct.r2.cloudflarestorage.com/bucket/a.webp',
        payloadHash: sha256Hex('x'),
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'secret'
    });

    assert.equal(headers['x-amz-content-sha256'], sha256Hex('x'));
    assert.match(headers.Authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date/);
});
