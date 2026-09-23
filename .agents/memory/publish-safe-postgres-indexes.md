---
name: Publish-safe PostgreSQL indexes
description: Guidance for avoiding malformed publish migrations from PostgreSQL expression indexes.
---

Treat PostgreSQL expression indexes as publish-sensitive. Before relying on one, inspect the development-to-production schema diff and confirm the generated SQL is complete and valid. Prefer a generated/search column with a regular index when the same behavior can be expressed that way.

**Why:** Replit’s publish introspection can misread complex expression-based GIN indexes and generate truncated SQL even when PostgreSQL’s stored index definition is valid. This can block the entire publish flow.

**How to apply:** For new or changed expression indexes, validate both Drizzle’s exported SQL and Replit’s publish schema diff. If the publish diff is malformed, use a publish-safe schema shape rather than adding production migration scripts or deployment-time DDL.