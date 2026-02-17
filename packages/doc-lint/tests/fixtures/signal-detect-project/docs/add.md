# Architecture Design Document

## Components
- Payment Service: handles charge creation via Stripe SDK
- Webhook Handler: receives and processes Stripe events
- Order Database: PostgreSQL for order state

## External Dependencies
- Stripe API (payments)
- PostgreSQL (persistence)

## Rate Limiting
- Token bucket rate limiting on all public endpoints
- API rate limit of 100 requests per second per client
- Sliding window for burst protection

## Database
- PostgreSQL primary database
- Redis cache for session storage
- Database migration scripts managed with Flyway
