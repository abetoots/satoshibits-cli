# Architecture Design Document

## Components
- Payment Service: handles charge creation via Stripe SDK
- Webhook Handler: receives and processes Stripe events
- Order Database: PostgreSQL for order state

## External Dependencies
- Stripe API (payments)
- PostgreSQL (persistence)
