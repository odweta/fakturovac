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