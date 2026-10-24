# Direct OpenAI API for CrysTrack — controlled activation

## Scope
- AI-only transport change. Today, Tasks, Goals, Assignments, and Wealth ledger are unchanged.
- Existing AI remains **OFF by default** with a separate **Wealth** switch.
- The AI chat remains read-only, with the same scoped-data allowlists, rate limiting,
  request permits, owner isolation, revocation checks, and limited history.
- External calls use **OpenAI Chat Completions** at a fixed server URL with `store: false`.
  This is not ChatGPT account login or the user's ChatGPT subscription.
- Default Chat and analysis model: `gpt-5.4-mini`, subject to OpenAI API availability and billing.
- Never place an API key in GitHub, chat, screenshots, logs, or NEXT_PUBLIC env vars.

## Activation prerequisites (not satisfied by code alone)
1. Owner creates a project-scoped secret key in https://platform.openai.com/api-keys .
   Set separate API billing/spend controls in https://platform.openai.com/settings/organization/billing/overview .
2. Owner adds the key to **Vercel > crystrackbeta > Settings > Environment Variables**
   as **OPENAI_API_KEY**, type Sensitive, scope Production only (not synthetic preview).
   `OPENAI_CHAT_MODEL` and `OPENAI_ANALYSIS_MODEL` are optional and default to
   `gpt-5.4-mini`. Do not reuse an OpenRouter key in OPENAI_API_KEY.
3. On a controlled release, apply migration
   `src/db/migrations/0025_direct_openai_provider_consent.sql`
   to the **correct CrysTrack** Supabase project after verifying existing six
   privacy functions and the latest schema. Do not reapply older migrations.
4. The migration changes the saved policy and sets **all previous AI and Wealth opt-ins
   to OFF**, advancing the revision. Old OpenRouter consent cannot authorize OpenAI.
   This does **not** clear tasks, transactions, or local AI history.
5. Release reviewed GitHub PR / exact passing SHA to Vercel production.
   Verify the production URL points to that SHA, not an unconfigured preview.
6. Owner signs in, opens CrysTrack Settings > AI & Privacy, reviews new OpenAI
   disclosure, enables external AI, and optionally consents to Wealth separately.
   Test one chat on non-sensitive activity data; verify no server logs contain prompts
   or API keys. Confirm failing/expired billing returns a safe error.

## Release safeguards
- Do not merge/activate this change while OPENAI_API_KEY is absent; it would leave
  production AI unconfigured.
- Do not apply the migration early; production OpenRouter permission reads would
  reject the new policy until matching code is live.
- Secrets must be added through Vercel's private environment UI and trigger a new
  deployment; editing Vercel env variables does not retroactively update older builds.
- Synthetic previews remain blocked from real providers.
- **No automatic OpenRouter fallback.** A missing OpenAI key fails closed.
- A ChatGPT Plus/Pro subscription does not include OpenAI API usage.
