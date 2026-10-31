
# SubsTrack — Subscription Management System

A full-stack subscription management application.

## Tech Stack

| Frontend | Backend | Database |
|----------|---------|----------|
| Next.js  | Express.js | PostgreSQL |
| TypeScript | Node.js | Raw SQL |
| Tailwind CSS | JWT |

## Local Setup

### 1. Clone Repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_REPOSITORY_FOLDER>
```

### 2. Backend Setup

```bash
cd server
npm install
npm run migrate
npm run dev
```

### 3. Frontend Setup

```bash
cd client
npm install
npm run dev
```


### Configure Environment Variables

Copy the `.env.example` file to `.env` in both the server and client directories (where provided).

**Backend:**
```bash
cd server
cp .env.example .env
```

**Frontend:**
```bash
cd client
cp .env.example .env.local
```

For Windows CMD, use `copy` instead of `cp`.

Update the copied files with your PostgreSQL credentials, JWT secret, SMTP configuration, and other required environment variables before starting the application.

