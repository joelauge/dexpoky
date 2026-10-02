# eBay comparable-sale policy

Card Lookup keeps the legacy search median reference-only. Its value is never
used as a fallback for the verified-sale median.

Eligible eBay values are the median of deduplicated individual sold item prices
from the last 90 days, without trimming or substituting generic search samples.
One matching sale can provide a snapshot, with its sample count disclosed.
Shipping and tax are excluded.

Each accepted sale must supply:

- A seller title explicitly naming the resolved card, set and printed number.
  Only one printed number is allowed; known numerator and denominator must match.
- Explicit English language, exactly one requested finish, and exactly one
  supported raw condition: mint, near mint or light played.
- No unknown title qualifiers, edition conflicts, alternate Pokémon suffixes,
  bundles, lots, grading companies/slabs, promos, stamps, proxies or special
  printings. Vintage sets require explicit Unlimited; catalog identities that
  cannot resolve edition must not imply first-edition or shadowless prices.
- A single USD item price on the US site, not a range, converted currency,
  zero price or best-offer amount.
- A dated "Sold" marker and a canonical eBay item link/ID from the same row.
  Missing markup, missing dates, future dates and older sales fail closed.

These checks verify **seller-stated listing attributes**, not authenticity,
photographic condition, settlement or payment. The UI states this distinction
and exposes every qualifying title, sale date, amount, item link and explanation.
No AI decision can bypass these deterministic checks.

Platform market/trend values are not condition-specific; an average mixes
different pricing measures and is disclosed as such. Only eligible independent
sources in the same finish and comparable USD currency can contribute.

Saving recomputes eBay's value from the documented sales in the owner-scoped,
expiring server lookup. It checks the owned printing, matching condition and
absence of pending/verified grading certificates, writes a transactional value
and history entry with sale IDs/dates/prices, and does not create a recurring
pricing rule. Normal future refreshes may replace the snapshot.