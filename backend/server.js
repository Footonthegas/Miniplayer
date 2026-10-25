import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';

const requiredEnv = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET', 'RAZORPAY_PLAN_ID', 'RAZORPAY_TOTAL_COUNT',
  'RAZORPAY_WEBHOOK_SECRET'
];
const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const totalCount = Number.parseInt(process.env.RAZORPAY_TOTAL_COUNT, 10);
if (!Number.isInteger(totalCount) || totalCount < 1) {
  console.error('RAZORPAY_TOTAL_COUNT must be a positive integer.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const app = express();
const PORT = Number(process.env.PORT || 3000);

// The API uses no cookies. Requests are authenticated with an installation token, so wildcard CORS is acceptable
// for this starter. Add stricter origin/rate controls before a large public launch.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const apiLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });
const checkoutLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api', apiLimiter);

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
function validIdentity(installId, activationToken) {
  return typeof installId === 'string' && /^[a-f0-9-]{36}$/i.test(installId)
    && typeof activationToken === 'string' && /^[a-f0-9]{64}$/i.test(activationToken);
}
function isPaidEntitlement(row) {
  if (!row) return false;
  if (row.subscription_status === 'active') {
    // Fail closed if Razorpay has not provided a paid-through timestamp.
    const currentEnd = Number(row.current_end);
    return Number.isFinite(currentEnd) && currentEnd > 0 && currentEnd * 1000 > Date.now();
  }
  // A cancelled/completed/halted subscription can retain access through the already-paid current period.
  // When no current period end is recorded, it is not considered entitled.
  if (['cancelled', 'completed', 'halted'].includes(row.subscription_status)) {
    return Boolean(row.current_end && Number(row.current_end) * 1000 > Date.now());
  }
  return false;
}
async function getEntitlementRow(installId) {
  const { data, error } = await supabase
    .from('premium_entitlements')
    .select('*')
    .eq('install_id', installId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

app.get('/health', (_req, res) => res.json({ ok: true }));

// Creates a unique subscription for this installation so a webhook can be associated with it.
// Do not replace this with a shared static subscription link if automatic activation is required.
app.post('/api/checkout', checkoutLimiter, express.json({ limit: '20kb' }), async (req, res) => {
  try {
    const { installId, activationToken } = req.body || {};
    if (!validIdentity(installId, activationToken)) return res.status(400).json({ error: 'Invalid installation identity.' });
    const tokenHash = sha256(activationToken);
    const existing = await getEntitlementRow(installId);

    if (existing && existing.token_hash !== tokenHash) {
      return res.status(403).json({ error: 'Installation identity could not be verified.' });
    }
    if (existing && isPaidEntitlement(existing)) {
      return res.status(409).json({ error: 'Premium is already active for this installation.', active: true });
    }
    // Reuse a recently generated link to prevent accidental duplicate subscriptions from repeated clicks.
    if (existing?.checkout_url && existing.checkout_created_at
        && Date.now() - new Date(existing.checkout_created_at).getTime() < 20 * 60_000
        && ['created', 'authenticated', 'pending'].includes(existing.subscription_status)) {
      return res.json({ url: existing.checkout_url, reused: true });
    }

    const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: process.env.RAZORPAY_PLAN_ID,
        total_count: totalCount,
        quantity: 1,
        customer_notify: true,
        notes: { extension_install_id: installId }
      })
    });
    const sub = await razorpayResponse.json().catch(() => ({}));
    if (!razorpayResponse.ok || !sub.id || !sub.short_url) {
      console.error('Razorpay subscription creation failed:', razorpayResponse.status, sub?.error?.code || 'unknown');
      return res.status(502).json({ error: 'Razorpay could not create the subscription link. Check the server configuration.' });
    }

    const row = {
      install_id: installId,
      token_hash: tokenHash,
      subscription_id: sub.id,
      subscription_status: sub.status || 'created',
      current_end: sub.current_end || sub.end_at || null,
      checkout_url: sub.short_url,
      checkout_created_at: new Date().toISOString(),
      cancel_at_cycle_end: false,
      cancel_requested_at: null,
      updated_at: new Date().toISOString()
    };
    const { error: saveError } = await supabase
      .from('premium_entitlements')
      .upsert(row, { onConflict: 'install_id' });
    if (saveError) throw saveError;

    return res.json({ url: sub.short_url, subscriptionId: sub.id });
  } catch (error) {
    console.error('Checkout error:', error?.message || error);
    return res.status(500).json({ error: 'Could not create checkout. Please try again.' });
  }
});

// Schedule cancellation at the end of the paid billing cycle. The raw Razorpay secret remains server-side.
// The activation token must match the installation that originally created the subscription.
app.post('/api/cancel', express.json({ limit: '20kb' }), async (req, res) => {
  try {
    const { installId, activationToken } = req.body || {};
    if (!validIdentity(installId, activationToken)) {
      return res.status(400).json({ error: 'Invalid installation identity.' });
    }
    const row = await getEntitlementRow(installId);
    if (!row || row.token_hash !== sha256(activationToken) || !row.subscription_id) {
      return res.status(404).json({ error: 'No subscription was found for this extension installation.' });
    }
    if (row.cancel_at_cycle_end === true) {
      return res.json({ scheduled: true, cancelAtCycleEnd: true, currentEnd: row.current_end || null });
    }
    const currentEnd = Number(row.current_end);
    if (row.subscription_status !== 'active' || !Number.isFinite(currentEnd) || currentEnd * 1000 <= Date.now()) {
      return res.status(409).json({
        error: 'This subscription does not have an active paid billing cycle. Contact support to resolve or cancel it.'
      });
    }

    const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const cancelResponse = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(row.subscription_id)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel_at_cycle_end: true })
    });
    const subscription = await cancelResponse.json().catch(() => ({}));
    if (!cancelResponse.ok) {
      console.warn('Razorpay cancellation request failed:', cancelResponse.status, subscription?.error?.code || 'unknown');
      return res.status(502).json({ error: 'Razorpay could not schedule cancellation. Contact support if the problem continues.' });
    }

    const updates = {
      cancel_at_cycle_end: true,
      cancel_requested_at: new Date().toISOString(),
      subscription_status: subscription.status || row.subscription_status,
      current_end: subscription.current_end || row.current_end,
      updated_at: new Date().toISOString()
    };
    const { error: updateError } = await supabase
      .from('premium_entitlements')
      .update(updates)
      .eq('install_id', installId)
      .eq('subscription_id', row.subscription_id);
    if (updateError) throw updateError;

    return res.json({
      scheduled: true,
      cancelAtCycleEnd: true,
      status: updates.subscription_status,
      currentEnd: updates.current_end ? Number(updates.current_end) : null
    });
  } catch (error) {
    console.error('Cancellation error:', error?.message || error);
    return res.status(500).json({ error: 'Could not schedule cancellation. Please try again.' });
  }
});

// Extension polls this endpoint after checkout. The installation token is never sent to Razorpay.
app.post('/api/entitlement', express.json({ limit: '20kb' }), async (req, res) => {
  try {
    const { installId, activationToken } = req.body || {};
    if (!validIdentity(installId, activationToken)) return res.status(400).json({ error: 'Invalid installation identity.' });
    const row = await getEntitlementRow(installId);
    if (!row || row.token_hash !== sha256(activationToken)) {
      return res.json({ active: false, status: 'not_found' });
    }
    return res.json({
      active: isPaidEntitlement(row),
      status: row.subscription_status,
      currentEnd: row.current_end ? Number(row.current_end) : null,
      cancelAtCycleEnd: row.cancel_at_cycle_end === true
    });
  } catch (error) {
    console.error('Entitlement lookup error:', error?.message || error);
    return res.status(500).json({ error: 'Could not verify Premium status.' });
  }
});

// IMPORTANT: webhook route uses the raw bytes for signature verification. Do not put express.json() before this route.
app.post('/api/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) return res.status(400).send('Expected raw JSON body');
    const signature = req.get('X-Razorpay-Signature') || '';
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest('hex');
    const receivedBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
      return res.status(400).send('Invalid webhook signature');
    }

    const event = JSON.parse(req.body.toString('utf8'));
    const subscription = event?.payload?.subscription?.entity;
    if (!subscription?.id) {
      // Ignore unrelated event types safely; they are not subscription state changes.
      return res.sendStatus(200);
    }

    const status = subscription.status || statusFromEvent(event.event);
    let currentEnd = subscription.current_end || subscription.end_at || null;
    // Some event payloads omit current_end; do not accidentally erase a previously verified paid-through date.
    if (!currentEnd) {
      const { data: existingRow, error: readError } = await supabase
        .from('premium_entitlements')
        .select('current_end')
        .eq('subscription_id', subscription.id)
        .maybeSingle();
      if (readError) throw readError;
      currentEnd = existingRow?.current_end || null;
    }
    const update = {
      subscription_status: status,
      current_end: currentEnd,
      updated_at: new Date().toISOString()
    };
    const { error, data } = await supabase
      .from('premium_entitlements')
      .update(update)
      .eq('subscription_id', subscription.id)
      .select('install_id');
    if (error) throw error;
    if (!data?.length) {
      // Subscription does not belong to a known extension installation; acknowledge without granting access.
      console.warn('Webhook received for an unmapped subscription:', subscription.id);
    }
    return res.sendStatus(200);
  } catch (error) {
    console.error('Webhook handling error:', error?.message || error);
    return res.sendStatus(500); // Razorpay can retry failed deliveries.
  }
});

function statusFromEvent(eventName) {
  const states = {
    'subscription.activated': 'active',
    'subscription.charged': 'active',
    'subscription.authenticated': 'authenticated',
    'subscription.pending': 'pending',
    'subscription.halted': 'halted',
    'subscription.cancelled': 'cancelled',
    'subscription.paused': 'paused',
    'subscription.resumed': 'active',
    'subscription.completed': 'completed'
  };
  return states[eventName] || 'unknown';
}

app.listen(PORT, '0.0.0.0', () => console.log(`Premium API listening on port ${PORT}`));
