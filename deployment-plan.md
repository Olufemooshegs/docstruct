# Production deployment plan

## 1. Prerequisites
- A host with Node.js 18+ and HTTPS support.
- A managed Postgres instance or a Dockerized Postgres service.
- A managed object storage or local disk volume for uploads.
- A domain and TLS certificate for the frontend and API.

## 2. Environment variables
Copy [.env.example](.env.example) to a real environment file and fill in values.

Required:
- `NODE_ENV=production`
- `JWT_SECRET`
- `DATABASE_URL` or PG variables
- `CORS_ORIGIN`
- `VITE_API_BASE_URL`

## 3. Runtime setup
- Install backend dependencies: `cd backend && npm install`
- Install frontend dependencies: `cd frontend && npm install`
- Apply migrations: `psql "$DATABASE_URL" -f backend/migrations/001_create_refresh_tokens.sql`
- Start backend: `cd backend && npm start`
- Build frontend: `cd frontend && npm run build`

## 4. Recommended deployment targets
- Render, Railway, Fly.io, or Heroku for full-stack hosting
- Cloudflare Pages or Vercel for the frontend with API proxy
- Azure App Service, AWS Elastic Beanstalk, or DigitalOcean App Platform

## 5. Production checklist
- Use HTTPS only
- Ensure cookies are `Secure` and `SameSite` is set appropriately
- Set strict CORS origins instead of allowing all origins
- Use a real SMTP provider for OTP delivery
- Persist uploads and generated files to durable storage
- Add monitoring and alerting for server and conversion failures
