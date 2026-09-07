const encoder = new TextEncoder();
const TOKEN = /^([A-Za-z0-9_-]{22})\.([a-z0-9]{8,12})\.([A-Za-z0-9_-]{43})$/;
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export const randomKey = () => base64url(crypto.getRandomValues(new Uint8Array(16)));
export async function hash(value) {
    return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
async function signingKey(secret) {
    return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function mintInvite(secret, expiresAt) {
    const payload = `${randomKey()}.${expiresAt.toString(36)}`;
    const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload));
    return `${payload}.${base64url(new Uint8Array(signature))}`;
}
export async function verifyInvite(secret, token, now = Date.now()) {
    const match = TOKEN.exec(token);
    if (!match || parseInt(match[2], 36) <= now) return false;
    const sig = Uint8Array.from(atob(match[3].replaceAll('-', '+').replaceAll('_', '/') + '='), c => c.charCodeAt(0));
    return crypto.subtle.verify('HMAC', await signingKey(secret), sig, encoder.encode(`${match[1]}.${match[2]}`));
}
