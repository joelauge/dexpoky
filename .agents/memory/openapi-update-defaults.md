---
name: OpenAPI update defaults
description: Why shared enum defaults can erase persisted fields in optional update requests.
---

Do not place defaults on shared enum schemas reused by partial update bodies. Put defaults on read-query inputs where appropriate, and apply creation defaults at the write boundary.

**Why:** Orval propagates shared enum defaults into optional update fields. Parsing an unrelated notes or bulk-condition update can then supply Unknown and erase a previously recorded edition.

**How to apply:** When adding a shared identity enum, test omitted update fields as well as explicit values. An omitted field must mean leave unchanged; generated optionality alone is not sufficient.