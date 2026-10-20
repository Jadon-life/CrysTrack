# PR #42 security re-review — actual synthetic Chromium screenshots

106 unedited captures from the normal optimized local app with real disposable
Supabase Auth/RLS. Both physical theme states preserve the September scenic UI.
Model HTTP is intercepted by the guarded test preload: zero real AI requests.
All accounts, private labels and money amounts are synthetic fixtures.

The new Goal captures show the corrected numeric-only scope explanation. The
missing-backend captures come from a separate server with a model key but no
backend credential: it fails closed without a model request. Payload previews are
bounded/scrollable; assertions inspect their full actual content. Browser headers
and request bodies are checked for backend credential exposure.

| Width | Theme | OFF | Consent | Disclosure | Minimal payload | Wealth scope | Chat | Clear | No model key | Goal numeric scope | No backend key |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 375 | dark | [View](off-dark-375.jpg) | [View](consent-dark-375.jpg) | [View](disclosure-dark-375.jpg) | [View](minimal-dark-375.jpg) | [View](wealth-dark-375.jpg) | [View](chat-dark-375.jpg) | [View](clear-dark-375.jpg) | [View](unconfigured-dark-375.jpg) | [View](goal-numeric-scope-dark-375.jpg) | [View](backend-unconfigured-dark-375.jpg) |
| 375 | light | [View](off-light-375.jpg) | [View](consent-light-375.jpg) | [View](disclosure-light-375.jpg) | [View](minimal-light-375.jpg) | [View](wealth-light-375.jpg) | [View](chat-light-375.jpg) | [View](clear-light-375.jpg) | [View](unconfigured-light-375.jpg) | [View](goal-numeric-scope-light-375.jpg) | [View](backend-unconfigured-light-375.jpg) |
| 430 | dark | [View](off-dark-430.jpg) | [View](consent-dark-430.jpg) | [View](disclosure-dark-430.jpg) | [View](minimal-dark-430.jpg) | [View](wealth-dark-430.jpg) | [View](chat-dark-430.jpg) | [View](clear-dark-430.jpg) | [View](unconfigured-dark-430.jpg) | [View](goal-numeric-scope-dark-430.jpg) | [View](backend-unconfigured-dark-430.jpg) |
| 430 | light | [View](off-light-430.jpg) | [View](consent-light-430.jpg) | [View](disclosure-light-430.jpg) | [View](minimal-light-430.jpg) | [View](wealth-light-430.jpg) | [View](chat-light-430.jpg) | [View](clear-light-430.jpg) | [View](unconfigured-light-430.jpg) | [View](goal-numeric-scope-light-430.jpg) | [View](backend-unconfigured-light-430.jpg) |
| 768 | dark | [View](off-dark-768.jpg) | [View](consent-dark-768.jpg) | [View](disclosure-dark-768.jpg) | [View](minimal-dark-768.jpg) | [View](wealth-dark-768.jpg) | [View](chat-dark-768.jpg) | [View](clear-dark-768.jpg) | [View](unconfigured-dark-768.jpg) | [View](goal-numeric-scope-dark-768.jpg) | [View](backend-unconfigured-dark-768.jpg) |
| 768 | light | [View](off-light-768.jpg) | [View](consent-light-768.jpg) | [View](disclosure-light-768.jpg) | [View](minimal-light-768.jpg) | [View](wealth-light-768.jpg) | [View](chat-light-768.jpg) | [View](clear-light-768.jpg) | [View](unconfigured-light-768.jpg) | [View](goal-numeric-scope-light-768.jpg) | [View](backend-unconfigured-light-768.jpg) |
| 1280 | dark | [View](off-dark-1280.jpg) | [View](consent-dark-1280.jpg) | [View](disclosure-dark-1280.jpg) | [View](minimal-dark-1280.jpg) | [View](wealth-dark-1280.jpg) | [View](chat-dark-1280.jpg) | [View](clear-dark-1280.jpg) | [View](unconfigured-dark-1280.jpg) | [View](goal-numeric-scope-dark-1280.jpg) | [View](backend-unconfigured-dark-1280.jpg) |
| 1280 | light | [View](off-light-1280.jpg) | [View](consent-light-1280.jpg) | [View](disclosure-light-1280.jpg) | [View](minimal-light-1280.jpg) | [View](wealth-light-1280.jpg) | [View](chat-light-1280.jpg) | [View](clear-light-1280.jpg) | [View](unconfigured-light-1280.jpg) | [View](goal-numeric-scope-light-1280.jpg) | [View](backend-unconfigured-light-1280.jpg) |
| 1440 | dark | [View](off-dark-1440.jpg) | [View](consent-dark-1440.jpg) | [View](disclosure-dark-1440.jpg) | [View](minimal-dark-1440.jpg) | [View](wealth-dark-1440.jpg) | [View](chat-dark-1440.jpg) | [View](clear-dark-1440.jpg) | [View](unconfigured-dark-1440.jpg) | [View](goal-numeric-scope-dark-1440.jpg) | [View](backend-unconfigured-dark-1440.jpg) |
| 1440 | light | [View](off-light-1440.jpg) | [View](consent-light-1440.jpg) | [View](disclosure-light-1440.jpg) | [View](minimal-light-1440.jpg) | [View](wealth-light-1440.jpg) | [View](chat-light-1440.jpg) | [View](clear-light-1440.jpg) | [View](unconfigured-light-1440.jpg) | [View](goal-numeric-scope-light-1440.jpg) | [View](backend-unconfigured-light-1440.jpg) |

[Cross-tab in-flight revocation](inflight-revoked-375.jpg): no late result was saved.

Other-owner views: [375px](other-owner-375.jpg), [430px](other-owner-430.jpg), [768px](other-owner-768.jpg), [1280px](other-owner-1280.jpg), [1440px](other-owner-1440.jpg).

Scoped Chromium checks are not a complete manual screen-reader/cross-browser certification.
