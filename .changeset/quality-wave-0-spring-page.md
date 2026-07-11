---
"bsuir-iis-api": patch
---

Make list endpoints resilient to Spring Data page envelopes.

- Add internal `unwrapSpringPageContent` helper for plain arrays vs `{ content: [...] }`.
- Use it in announcements and catalog `listAll` (first page only).
- Strengthen live-contract canaries for announcement pagination shapes and catalog arrays.
