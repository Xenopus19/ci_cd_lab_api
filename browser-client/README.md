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
Set `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, and
`VITE_KEYCLOAK_CLIENT_ID` to override the defaults.

Register or log in with Keycloak, then open **Secure messaging** from your
profile. Logout ends the Keycloak browser session. The page
sends encrypted messages, shows decrypted replies, and lists sessions; it
creates a new cryptographic session if the current one expires.

Web Crypto requires a secure context (HTTPS or localhost). For production,
serve the app over HTTPS and route `/api` to the API. The page requires login
in the frontend; the cryptographic and session-list API endpoints themselves
do not currently require authentication.

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
