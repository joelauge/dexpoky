---
name: Repository authority
description: Which DexPoky version is authoritative when syncing with GitHub.
---

Use the GitHub repository joelauge/dexpoky, but use this Replit version rather than the version in the repository.

**Why:** The user explicitly selected the Replit version as authoritative.

**How to apply:** Do not import or pull repository code over this workspace. Confirm the destination branch and replacement scope before overwriting existing GitHub content or history.

GitHub reconnection can replace the integration's connection identifier, while workspace Git authentication may still reject a push even when the integration reports itself active.

**Why:** Reconnecting GitHub did not restore CLI push access, and the previous connection identifier became unusable.

**How to apply:** Refresh the integration listing after reconnection. Treat a successful Git operation—not an active-connection status—as proof that authentication works. Do not repeatedly ask the user to reconnect when the new connection is already present.
