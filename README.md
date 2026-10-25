# Mini Player — Razorpay launch kit

This kit combines the current extension in `extension/`, the Node API in `backend/`, a Supabase schema, a Render Blueprint for a free test deployment, and public policy/support pages in `site/`.

> **Not live yet:** No server is deployed and no Razorpay plan, Supabase project, or webhook has been configured. Replace every bracketed publisher/legal placeholder and run a full test-mode subscription before accepting real payments.

## Folder map

- `extension/` — load this folder with Chrome → `chrome://extensions` → Developer mode → **Load unpacked**.
- `backend/server.js` — creates a per-installation Razorpay subscription checkout URL, validates Razorpay webhook signatures, and responds to entitlement checks.
- `backend/schema.sql` — table for server-side entitlements; run it in Supabase SQL Editor.
- `backend/.env.example` — list of server environment variables; copy values to your hosting provider's secret/environment settings. Never put live secrets in this file.
- `site/` — static privacy policy, terms/subscription policy, support page, and shared CSS.
- `render.yaml` — creates a free Render API service and free static legal-pages site when imported as a Blueprint. It deliberately does not embed credentials.

## A. Set up a Razorpay Subscription Plan

1. Sign in to the Razorpay Dashboard and switch to **Test Mode**.
2. Open **Subscriptions → Plans → Create Plan**.
3. Choose the real amount, currency and billing frequency you intend to sell. Write the price and frequency down; these must match what users see before checkout.
4. Create the plan and copy its `plan_...` ID from Test Mode. Razorpay documents that a plan must exist before a subscription is created, and that a plan cannot be edited/deleted after creation; create a new plan if you made a mistake.
5. In the backend environment, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`, and `RAZORPAY_TOTAL_COUNT` using **Test Mode** credentials and plan ID.

`RAZORPAY_TOTAL_COUNT=12` means **12 billing cycles**, not an unlimited/forever subscription. Set it to the duration that matches your offer and explain the number of cycles to the customer. Do not use a generic or misleading “monthly forever” claim unless your payment configuration genuinely supports that billing arrangement.

Official Razorpay reference: https://razorpay.com/docs/api/payments/subscriptions/create-plan/ and https://razorpay.com/docs/api/payments/subscriptions/create-subscription/.

## B. Create the Supabase database (free tier for testing)

1. Create a Supabase project at https://supabase.com/.
2. Open the project's **SQL Editor**.
3. Copy all of `backend/schema.sql` into the editor and run it.
4. In Project Settings / API, copy the Project URL and the **service-role** key into Render environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The service-role key is highly privileged. Keep it on the backend only. Never put it in `extension/`, public GitHub code, a web page, or a message. Supabase says free projects with low activity over a seven-day period may be paused; resume them from the dashboard if this happens.

## C. Deploy both services on Render's free tier (testing/MVP)

Render's free web services are suitable for testing, but their current documentation says an idle free web service spins down after 15 minutes and may take about a minute to wake. Render explicitly advises against free instances for production applications. Webhook processing and the first Premium check can therefore be delayed; for a paid public launch, plan for a reliable paid service or a serverless implementation with suitable availability.

1. Put this whole folder into a Git repository and push it to a private or public GitHub repository. **Do not commit `.env` or real credentials.** The root `.gitignore` excludes `.env` and `node_modules`.
2. Sign in at https://render.com/ and connect the repository.
3. In Render choose **New → Blueprint**, select the repository, and import the root `render.yaml`.
4. Render should create `mini-player-premium-api` and `mini-player-legal-pages`. Enter the missing secret values when prompted, or open the API service's **Environment** page to set them:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_PLAN_ID`
   - `RAZORPAY_WEBHOOK_SECRET`
   - Verify `RAZORPAY_TOTAL_COUNT` matches the offer; Blueprint default is `12`.
5. Wait for both deploys. The API service URL will look like `https://mini-player-premium-api.onrender.com`. Visit `<API_URL>/health`; expected response: `{"ok":true}`. If deploy names have a suffix, use the exact host Render gives you.
6. The static site service URL will look like `https://mini-player-legal-pages.onrender.com`. Confirm `/privacy.html`, `/terms.html`, and `/support.html` load.
7. Replace all publisher placeholders in `site/privacy.html`, `site/terms.html`, and `site/support.html`, commit, and redeploy. Do this before using those pages for the Chrome Web Store or customers.

Render official docs: https://render.com/docs/blueprint-spec and https://render.com/docs/free.

## D. Register Razorpay webhook

1. Open Razorpay Dashboard in **Test Mode** and find Webhooks in account/website settings (the exact menu label can change).
2. Add URL: `https://YOUR-API-HOST.onrender.com/api/razorpay/webhook` (replace with the exact API host).
3. Set a long random webhook secret; copy the exact same value to Render's `RAZORPAY_WEBHOOK_SECRET`. This is separate from `RAZORPAY_KEY_SECRET`.
4. Subscribe to the subscription events used by the server:
   - `subscription.authenticated`
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.pending`
   - `subscription.halted`
   - `subscription.cancelled`
   - `subscription.paused`
   - `subscription.resumed`
   - `subscription.completed`
5. Save the webhook. Use Razorpay's test-event/delivery logs and Render logs to confirm webhook requests reach the endpoint and return HTTP 200.
6. The backend verifies `X-Razorpay-Signature` against the raw request body before updating the entitlement database. Do not switch the webhook secret or API keys to Live Mode until all Test Mode checks succeed. Configure a separate Live Mode plan, keys, and webhook later.

Razorpay reference: https://razorpay.com/docs/webhooks/subscriptions/ and https://razorpay.com/docs/webhooks/validate-test/.

## E. Point the extension to your API

1. Edit `extension/background.js` and set `API_BASE` to your API origin only, e.g. `https://mini-player-premium-api.onrender.com` (no `/api` suffix, no trailing endpoint path).
2. Edit `extension/manifest.json`. Replace the placeholder host permission `https://your-api.example.com/*` with your actual API host permission, e.g. `https://mini-player-premium-api.onrender.com/*`.
3. Go to `chrome://extensions` and press **Reload** for the unpacked extension. Open the welcome page/popup and try **Subscribe to Premium**.
4. Complete a Test Mode checkout. Check webhook delivery in Razorpay and the subscription record in Supabase. Then click **I have paid — check Premium**. The server must return `active: true` with a future current-period end before the extension unlocks Premium.
5. Reload the Netflix tab and test Automatic Mini Player. Browser/Netflix policies mean automatic PiP itself is not guaranteed in every situation.

## F. Publish policy URLs

After deploying the static site and replacing placeholders, set `LEGAL_SITE_URL` near the top of `extension/welcome.js` to the exact static-site origin (no trailing slash), then reload the extension. The extension will show Privacy, Terms, and Support links in the welcome-page footer. Your public URLs will be similar to:

- `https://mini-player-legal-pages.onrender.com/privacy.html`
- `https://mini-player-legal-pages.onrender.com/terms.html`
- `https://mini-player-legal-pages.onrender.com/support.html`

Use the privacy-policy URL in the Chrome Web Store Developer Dashboard's privacy policy field. Keep it accurate and accessible. Chrome Web Store policies require an accurate privacy policy if a product handles user data and disclosure of how data is collected, used and shared. Also complete the Store's data-use disclosures to match the final code; policy text alone does not replace those declarations.

Chrome Web Store policy reference: https://developer.chrome.com/docs/webstore/program-policies/policies.

## G. Before taking real payments

- Replace all square-bracketed policy placeholders (legal/publisher name, support email, price, frequency, cycle count, refund rules, cancellation path and jurisdiction).
- Make the cancellation path real and tested; uninstalling the extension does not cancel a subscription.
- Confirm the checkout screen and website clearly show amount, renewal frequency, maximum cycles/term, taxes and how to cancel.
- Test failed payment, renewal/charge, cycle-end cancellation, halted subscription, completed subscription, webhook retry, and delayed webhook.
- Make sure the Razorpay Test Mode values and Live Mode values are never mixed.
- Do not publicly share Razorpay secret key, webhook secret, Supabase service-role key, or a customer's payment credentials.
- Consider paid/reliable hosting before launching a paid product; free services may sleep or pause.

## Local backend run (optional)

From `backend/`:

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and fill in Test Mode values.
3. Run `npm install`, then `npm start`.
4. Visit `http://localhost:3000/health`.

Local HTTP is for development only. The extension intentionally rejects non-HTTPS remote API origins; use a trusted HTTPS deployment to test the extension's payment flow.
