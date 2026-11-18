# Browser client

Run the API on port 3000 and Keycloak on port 8080, then run `npm install`
and `npm run dev` in this directory. The Vite development server proxies `/api`
requests to the API.

Configure Keycloak with a realm named `oidc-lab`, enable **User registration**
in its login settings, and create a public OpenID Connect client named
`lab-spa`. Enable standard flow and PKCE with `S256`; allow the SPA's URLs
(for example `http://localhost:5173/*`) as valid redirect URIs, its origin
(`http://localhost:5173`) as a web origin, and `http://localhost:5173/` as a
valid post-logout redirect URI. Use the actual Vite port if it differs.
Create a client scope with an **Audience** protocol mapper that adds the
custom audience `lab-api` to the access token (not just the ID token), and
assign that scope as a default client scope to `lab-spa`. Verify the access
token contains `lab-api` in `aud`. The API issuer defaults to
`http://localhost:8080/realms/oidc-lab`; set `OIDC_ISSUER` on the API if the
realm publishes a different issuer, and ensure the API can reach discovery and
JWKS at the published URLs.
Set `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, and
`VITE_KEYCLOAK_CLIENT_ID` to override the defaults.

Register or log in with Keycloak, then open **Secure messaging** from your
profile. Logout ends the Keycloak browser session. The page
sends encrypted messages, shows decrypted replies, and lists sessions; it
creates a new cryptographic session if the current one expires.

Web Crypto requires a secure context (HTTPS or localhost). For production,
serve the app over HTTPS and route `/api` to the API. The shared HTTP client
refreshes and sends the Keycloak access token on API requests; the API
validates it on every `/api` route. The displayed username comes from the ID
token.

For a separate API origin, build the SPA with `VITE_API_URL` set to the API
origin (for example `https://api.example.com`) and set `SPA_ORIGIN` on the API
to the exact SPA origin (for example `https://app.example.com`, without a
trailing slash). CORS is disabled unless `SPA_ORIGIN` is set. The API permits
GET, HEAD, POST, PUT, DELETE and OPTIONS, and the Authorization, Content-Type,
X-Local-Authorization, X-Rsa-Id and X-Session-Id headers. With the default
same-origin proxy, neither variable is needed.

## Vite template

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
