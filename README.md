# 🚚 WordPress → Sanity Migrator

A visual, 4-step dashboard for migrating WordPress content into Sanity. From SQL dump to live import — without the headaches.

---

## ✨ Features

- 🐳 **Docker Management** — spin up MariaDB and import your SQL dump in one click
- 🔄 **Prepare Migration** — extract posts, pages and media into Sanity-ready JSON
- 🔍 **Verify Migration** — search, filter and preview every transformed post
- 🚀 **Import to Sanity** — test run a single post, then ship the whole dataset

---

## 🛠️ Quick Start

```bash
yarn install
yarn dev
```

Drop your data into `/input`:

- `input/backup.sql` — WordPress database dump
- `input/uploads/` — media files (keep WordPress year/month structure)

Set Sanity credentials in `.env.local`:

```
NEXT_PUBLIC_SANITY_PROJECT_ID=...
NEXT_PUBLIC_SANITY_DATASET=...
SANITY_API_WRITE_TOKEN=...
SANITY_API_VERSION=...
```

---

## 📋 The 4 Steps

### 1️⃣ Spin up the database from your SQL dump

![Docker Management](docs/01-database-from-sql-dump.png)

### 2️⃣ Prepare the migration

![Prepare Migration](docs/02-migration-options.png)

### 3️⃣ Verify every post before it ships

![Verify Migration](docs/03-verify-migration.png)

### 4️⃣ Test import a single post, then go for real

![Test Import](docs/04-import-test-run.png)
![Full Import](docs/05-import-for-real.png)

---

## 🧪 Development

```bash
yarn dev            # dev server (Turbopack)
yarn test           # run tests
yarn lint           # lint
yarn build          # production build
```

---

## 📄 License

MIT — see [LICENSE](LICENSE).
