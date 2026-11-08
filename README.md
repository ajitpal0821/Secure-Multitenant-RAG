
# Secure Multi-Tenant RAG

An AI security project exploring vulnerabilities and
defenses in multi-tenant Retrieval-Augmented Generation
(RAG) applications.

## Technology Stack

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- PostgreSQL + pgvector
- Redis
- Gemini API
- Docker + Docker Compose
- JWT Authentication

## Security Modes

- Vulnerable: Intentionally insecure implementation.
- Hardened: Security controls enabled independently.

## Project Structure

- api/: Backend application
- web/: Frontend application
- tests/: Security attack test suite
- docs/: Threat models and documentation

## Getting Started

1. Clone the repository.
2. Copy .env.example to .env.
3. Configure local environment variables.
4. Start infrastructure:

   docker compose up -d

5. Check service health:

   docker compose ps

## Project Status

Phase 1: Infrastructure setup.
