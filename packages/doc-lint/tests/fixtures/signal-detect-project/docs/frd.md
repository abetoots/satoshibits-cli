# Functional Requirements

## Payment Flow
1. User submits payment form
2. Server calls Stripe API to create charge
3. Stripe sends webhook on completion
4. Order status updated

## API Endpoints
- POST /api/payments - create payment
- POST /api/webhooks/stripe - receive Stripe webhooks

## Authentication
- Users authenticate via login endpoint
- Auth tokens issued on successful sign in
- MFA support with TOTP codes
- Two-factor authentication required for admin users
