# Fakturovac

A simple app for creating and managing invoices.

The app uses PostgreSQL for accounts, sessions, supplier profiles, and clients.
Supplier and client data is private to the signed-in account.

To deploy, run:

```
make deploy
```

Or start the stack directly from this directory:

```bash
docker compose up --build
```

Then open `http://localhost:3001` and create an account. PostgreSQL data is kept
in the `postgres-data` Docker volume, so it survives app and container restarts.
To remove the database as well, run `docker compose down -v`.

## CI/CD

On every push to `main`, GitHub Actions (`.github/workflows/ci-cd.yml`) runs the
test suite, then builds and publishes a dev image to the GitHub Container
Registry:

```
ghcr.io/odweta/fakturovac:dev
```

A commit-pinned tag (`ghcr.io/odweta/fakturovac:dev-<short-sha>`) is published
alongside `:dev` for traceability. Pull requests only run the test job.

To pull and run the latest dev image in a testing environment:

```bash
docker login ghcr.io -u <your-github-username>   # only needed if the package is private
docker pull ghcr.io/odweta/fakturovac:dev
docker run -d -p 3001:3001 \
  -e DATABASE_URL=postgres://fakturovac:fakturovac@<db-host>:5432/fakturovac \
  -e NODE_ENV=production \
  ghcr.io/odweta/fakturovac:dev
```

The package's visibility (public/private) is managed under the repository's
**Packages** settings on GitHub; no extra secrets are required since the
workflow authenticates with the built-in `GITHUB_TOKEN`.