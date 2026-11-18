import { auth } from 'express-oauth2-jwt-bearer';

const issuer = process.env.OIDC_ISSUER ?? 'http://localhost:8080/realms/oidc-lab';

export const requireOidcAuth = auth({
    issuerBaseURL: issuer,
    issuer,
    audience: 'lab-api',
    clockTolerance: 0,
    dpop: { enabled: false },
});
