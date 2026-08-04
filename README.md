# DocStruct AI

## Transform handwritten or unstructured text into professionally structured documents using AI.

## Overview

DocStruct AI is an intelligent document generation tool designed to solve a common problem faced by students, researchers, professionals, and content creators: converting raw written content into a properly formatted and structured Word document.

While working on academic projects, reports, and documentation, a major challenge is not always writing the content itself but organizing it into a professional document format. Users often spend hours manually arranging headings, paragraphs, sections, references, tables, and formatting.

DocStruct AI aims to automate this process by understanding written content and transforming it into a structured, editable document.

## Problem Statement

Most existing document tools focus on editing already structured documents. They do not solve the problem of taking raw text, notes, or scanned content and intelligently converting it into a complete document structure.

For example:

Input:




Output:
A professionally formatted Word document with:

- Proper headings
- Sections and subsections
- Paragraph formatting
- Table of contents
- Page numbering
- References section
- Professional styling


## Features

### Intelligent Text Structuring
- Detects document sections automatically
- Identifies headings and subheadings
- Groups related information
- Improves document organization

### AI-Powered Formatting
- Converts plain text into professional documents
- Applies academic and business formatting standards
- Supports different document templates

### Document Generation
- Export to Microsoft Word (.docx)
- Export to PDF
- Editable output files

### Content Understanding
- Uses Natural Language Processing to understand context
- Detects important sections such as:
  - Introduction
  - Methodology
  - Results
  - Conclusion
  - References

### Future Features

- Handwriting recognition using OCR
- Automatic citation generation
- Grammar improvement
- AI-generated summaries
- Academic formatting styles (APA, IEEE, MLA)
- Collaboration features


# System Architecture

The application can be divided into several components:

## 1. Input Processing Layer

Responsible for accepting user content.

Possible inputs:

- Typed text
- Uploaded documents
- Images of handwritten notes
- Scanned pages


Technologies:

- OCR engines
- Text extraction libraries
- Document parsers


## 2. AI Processing Engine

The core intelligence layer responsible for understanding and structuring content.

Responsibilities:

- Text classification
- Section detection
- Semantic understanding
- Document hierarchy generation
# DocStruct

DocStruct is a full-stack application for converting raw text, scanned pages, or uploads into professionally structured Word and PDF documents using NLP and document generation tooling.

This repository contains a Node.js/Express backend (backend/) and a Vite + React frontend (frontend/). The backend provides authentication (httpOnly cookie JWTs + refresh tokens), document generation and conversion endpoints, and optional persistence for refresh tokens using Postgres or Redis.

Contents
- backend/: Express API, conversion, auth, and migrations
- frontend/: Vite + React UI
- backend/migrations/: SQL migrations (Postgres)
- backend/uploads/: generated and uploaded files

Quickstart (developer)
1. Install dependencies
  - Backend:
  ```powershell
  cd backend
  npm install
  ```
  - Frontend:
  ```powershell
  cd frontend
  npm install
  ```

2. Run a local Postgres (recommended)
- Option A: Docker (recommended, no host install)
  ```bash
  docker run --name docstruct-postgres -e POSTGRES_PASSWORD=postgrespw -e POSTGRES_DB=docstruct -p 5432:5432 -d postgres:15
  export DATABASE_URL=postgresql://postgres:postgrespw@localhost:5432/docstruct
  ```
- Option B: Install locally (Windows Chocolatey / Installer) — set `DATABASE_URL` accordingly.

3. Apply migrations
  ```powershell
  psql "$env:DATABASE_URL" -f backend/migrations/001_create_refresh_tokens.sql
  ```

4. Start backend and frontend
  - Backend (dev):
  ```powershell
  cd backend
  npm run dev
  ```
  - Frontend (dev):
  ```powershell
  cd frontend
  npm run dev
  ```

Environment variables
- `JWT_SECRET` (required) — strong secret for signing access JWTs
- `NODE_ENV` — use `production` in production to enforce secure cookie flags
- `REFRESH_EXPIRES_IN_DAYS` — default 30
- `DATABASE_URL` — Postgres connection string (optional; if provided, refresh tokens persist in Postgres) 
- `REDIS_URL` — Redis connection (optional; when set, refresh tokens use Redis)

Authentication model
- Short-lived access token stored in an httpOnly cookie named `docstruct_token`.
- Long-lived opaque refresh token stored in an httpOnly cookie named `docstruct_refresh` and persisted server-side (Redis or Postgres) when available.
- Endpoints: `/api/auth/signup`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`.

Database migration
- A migration is included at `backend/migrations/001_create_refresh_tokens.sql` which creates the `refresh_tokens` table used when `DATABASE_URL` is set.

File conversion and document generation
- The backend exposes endpoints for conversion and generation (see `backend/server.js`).
- Uploaded files and generated outputs are stored under `backend/uploads/` during development.

Running tests
- Backend tests:
```powershell
cd backend
npm test
```

Docker compose (optional)
You can add a small `docker-compose.yml` (not included) to run Postgres + backend. The project is intentionally simple and can run behind a reverse proxy in production.

Security & production notes
- Always run behind HTTPS and set `NODE_ENV=production` so cookies are marked `Secure`.
- Persist refresh tokens using Redis or Postgres for multi-instance deployments; do not rely on in-memory store.
- Keep `JWT_SECRET` secret and rotate when necessary.

Developer notes
- Frontend API helper sends requests with `credentials: 'include'` to support cookie-based auth. See `frontend/src/lib/api.ts`.
- Refresh token helpers in the backend support Redis and Postgres. If neither is configured the server falls back to an in-memory Map (development only).

Where to look
- Backend entry: [backend/server.js](backend/server.js)
- Frontend entry: [frontend/src/main.tsx](frontend/src/main.tsx)
- Tests: [backend/tests](backend/tests)
- Migrations: [backend/migrations](backend/migrations)

Contributing
- Open issues and PRs are welcome. Describe the feature, include tests where appropriate, and keep changes focused.

License
- MIT
