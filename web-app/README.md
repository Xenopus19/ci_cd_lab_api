# Cats web interface

The React single-page application uses the Cats API to list, create, update and
delete cats. With the API running on port 3000, run `npm ci` and `npm run dev`
in this directory. Vite proxies `/api/cats` to the local API.

Run `npm run lint` and `npm run build` to validate the application. The
production Docker image serves the built application with nginx and proxies
`/api/cats` to `API_URL` (default `http://api:3000`). See the repository
README for database setup and Helm deployment.
