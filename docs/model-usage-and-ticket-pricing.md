# Model usage and ticket pricing

The current pricing rule is **OpenAI API cost × 2**. The ticket catalog uses **100 tickets = ₹80**, so one ticket represents ₹0.80. Tickets and provider tokens are different units. A request does not consume one ticket per token.

## Calculation

For standard text requests, the calculator separates ordinary input, cached input, cache writes where supported, and output. Rates are in USD per million tokens. Output includes any reasoning tokens reported by the provider. Cached reads are a subset of input, not extra tokens added to the total. Cache writes are also a subset of input.

```text
ordinary input = input tokens − cached tokens − cache write tokens
OpenAI cost = (ordinary input × input rate
             + cached tokens × cached rate
             + cache write tokens × write rate
             + output tokens × output rate) / 1,000,000
usage charge in USD = OpenAI cost × 2
usage charge in INR = usage charge in USD × USD/INR reference
ticket equivalent = usage charge in INR / 0.80
```

Tiny charges retain fractional tickets. They are not rounded up to a whole ticket per request. No invented minimum charge is applied.

For example, GPT-4.1-nano with 38 ordinary input tokens and 10 output tokens costs $0.0000078 at the documented standard rates. The platform's usage charge is $0.0000156, or ₹0.001505088 and 0.00188136 tickets at the configured ₹96.48 conversion. This is 48 API tokens, not 48 tickets.

## Source and updates

- [Official OpenAI pricing](https://developers.openai.com/api/docs/pricing) supplies the versioned standard text and embedding rate catalog in `lib/openai-pricing.json`.
- [Official prompt caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching) explains cached input and cache-write accounting.
- `npm run pricing:update` refreshes the catalog from the official Markdown table. It validates the response before replacing the current catalog.
- Long-context rates are used above the documented 272K input threshold where the rate table provides them.
- New usage records store token details, the price verification date, cost calculation, multiplier, conversion reference, and ticket equivalent. A future catalog update does not rewrite those snapshots.
- USD/INR defaults to the user-specified ₹96.48 per $1. `USD_INR_RATE` can override this configured rate; no external currency API is used. If conversion is unavailable, USD amounts remain available and INR/tickets are explicitly unavailable. A bank's actual settlement rate can differ.

## Coverage across the application

The shared usage recorder is used by Playground, published agents, ePACE generation/retrieval/ranking/evaluation, Review Center paid chat, service enrichment, tool analysis, and vulnerability analysis. ePACE embeddings are charged as input-only token usage. The free operational assistant records its local replies separately with zero model cost.

Standalone greetings in Playground, published-agent chat, ePACE, and Review Center are handled locally. They do not invoke a generative model, retrieve knowledge, or reuse unrelated conversation context. ePACE still honors configured content-safety checks; the current moderation model is free under the official pricing table.

Playground supplies the project identity and relevant document sections rather than the entire overview on every request. Provider-backed conversations retain bounded, complete recent turns and concise-answer guidance without deleting user instructions or required evidence.

## What the values mean

Recent model activity displays real input, output, and total counts, cached/written tokens where recorded, estimated OpenAI cost, the ×2 usage charge, fractional ticket equivalents, and IST timestamps. Provider tokens are never divided or altered to make a request appear cheaper.

Historical records lack some cache and price information. They are marked as historical estimates and do not have newly fabricated cache hits. Unknown model prices, unsupported service tiers, and missing cache-write details for models that charge for writes are unpriced, not free. Totals disclose excluded requests.

These values are request-level usage accounting, not a reconciled OpenAI invoice. Standard public rates do not establish account-specific discounts, taxes, bank fees, tool-call/storage charges, regional surcharges, or costs from unrecorded provider failures. Audio, image generation, fine-tuned models, hosted tools, and external cloud billing require their own usage fields and pricing adapters before charging. The application does not currently run those modalities through this calculator.

Checkout and funded ticket balances remain unavailable until a payment provider and payment ledger are connected. Recorded usage quotes do not collect money or debit a funded wallet. Actual settlement should use verified usage snapshots and invoice reconciliation rather than historical estimates.

## Playground model selection and failed sends

The model list refreshes the live OpenAI account catalog once per minute. Candidate GPT/reasoning text models are checked against their official model documentation for text output and Responses support, including new GPT-6 versions. GPT-4.1/GPT-4o retain sampling controls; other families use provider defaults without unsupported sampling parameters. Other modalities remain visible with an unsupported status and cannot be selected. Previously seen IDs removed from OpenAI's list are marked unavailable for the current server session. Listing and documentation are not proof of generation permission or quota. The selector prevents arbitrary IDs; the server rejects unsupported IDs before any generation call.

Pending questions appear locally while processing. Only question/reply pairs with returned answer text are saved atomically to PostgreSQL. Partial answers are displayed with an output-limit notice. On failure the pending bubble is removed and the draft is restored. Migration 0026 removes stale trailing unanswered questions left by the former flow. Operational failure logs remain available for diagnostics.

Selectable models are numbered by ascending standard cost for equal input and output volumes. Actual cost depends on input/output mix, caching, reasoning and context size. Astra is deliberately last by user preference, rather than a claim that it is always the most expensive. Models with unknown prices sort after priced models, before Astra.

Legacy model aliases are matched to verified official default snapshots or their own published model rates. Previously unpriced activity can display a recovered current-rate estimate; valid stored quotes remain unchanged. Review Center paid AI requests use up to 12 selected evidence records and two previous exchanges for focused questions, retaining the larger 50-record context for explicitly broad requests. Playground uses up to eight recent messages within 8,000 characters and only relevant overview sections. These limits reduce future input size without falsifying historical provider counts.

Playground uses the public Responses API directly so incomplete responses retain partial text and actual provider usage. GPT-5, GPT-5 mini and GPT-5 nano use minimal reasoning effort. Max tokens includes reasoning and visible output; limits are never silently increased, and incomplete responses are not automatically retried. Empty failed answers restore the draft; consumed provider tokens remain recorded.

Project facts are application-maintained context. Product answers address the user directly without attributing this context to them, unnecessary live-access disclaimers, or generic closing offers. Live operational claims still require evidence and supported tools.

Playground stores generated answers up to 60,000 characters while questions remain limited to 12,000. Migration 0027 aligns PostgreSQL with the API. A history-storage failure preserves the generated answer in the current chat and displays a save warning without issuing another model call. Requests send bounded recent context independently of full displayed history.
