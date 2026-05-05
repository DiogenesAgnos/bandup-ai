// api/paddle/webhook.js
// Paddle webhook handler — called by Paddle when subscription events occur.
// Handles: subscription.created, subscription.activated, subscription.canceled
// Sends email notification to owner on every successful payment.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Send email notification via EmailJS REST API (works server-side)
async function notifyOwner(subject, message) {
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:  "service_9es76g1",
        template_id: "template_jrd4i4n",
        user_id:     "Wl_oo3VnUzPGW3MB4",
        template_params: {
          from_name:  subject,
          from_email: "webhook@englishfool.com",
          country:    "—",
          age_group:  "—",
          message,
        },
      }),
    });
    console.log("Owner notification sent:", subject);
  } catch (e) {
    console.error("Failed to send owner notification:", e);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Paddle-Signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // In production, you should verify the Paddle-Signature header.
  // For now, we process the event directly.
  const event = req.body;
  if (!event || !event.event_type) {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  const eventType = event.event_type;
  const data = event.data;
  console.log(`Paddle webhook: ${eventType}`, JSON.stringify(data?.customer_id || ''));

  try {
    // Extract customer email from the event
    let email = null;
    if (data?.customer?.email) {
      email = data.customer.email.toLowerCase().trim();
    } else if (data?.custom_data?.email) {
      email = data.custom_data.email.toLowerCase().trim();
    }

    if (!email) {
      console.log('No email found in webhook payload');
      return res.status(200).json({ received: true, note: 'No email found' });
    }

    // Handle subscription created/activated — activate Pro
    if (['subscription.created', 'subscription.activated', 'subscription.updated'].includes(eventType)) {
      const status = data?.status;
      if (status === 'active' || status === 'trialing') {
        // Activate Pro
        const { data: profile } = await supabase.from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (profile) {
          await supabase.from('profiles')
            .update({
              is_pro: true,
              pro_activated_at: new Date().toISOString()
            })
            .eq('email', email);
          console.log(`Pro activated for ${email}`);
          await notifyOwner(
            `🎉 New Pro Subscriber — EnglishFool`,
            `New Pro subscription activated!\n\nEmail: ${email}\nEvent: ${eventType}\nTime: ${new Date().toLocaleString('en-GB', {timeZone:'Asia/Amman'})}`
          );
        } else {
          // Store for later activation when user registers
          await supabase.from('activations').upsert({
            email,
            is_pro: true,
            activated_at: new Date().toISOString()
          }, { onConflict: 'email' }).catch(() => {});
          console.log(`Activation stored for ${email} (not yet registered)`);
          await notifyOwner(
            `🎉 New Pro Payment (Pre-Registration) — EnglishFool`,
            `New Pro payment received — user hasn't registered yet.\n\nEmail: ${email}\nEvent: ${eventType}\nTime: ${new Date().toLocaleString('en-GB', {timeZone:'Asia/Amman'})}\n\nPro will activate automatically when they sign up.`
          );
        }
      }
    }

    // Handle subscription canceled/paused — deactivate Pro
    if (['subscription.canceled', 'subscription.past_due'].includes(eventType)) {
      const { data: profile } = await supabase.from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (profile) {
        await supabase.from('profiles')
          .update({ is_pro: false })
          .eq('email', email);
        console.log(`Pro deactivated for ${email}`);
        await notifyOwner(
          `❌ Pro Subscription Cancelled — EnglishFool`,
          `A Pro subscription was cancelled.\n\nEmail: ${email}\nEvent: ${eventType}\nTime: ${new Date().toLocaleString('en-GB', {timeZone:'Asia/Amman'})}`
        );
      }
    }

    // Handle transaction completed (one-time backup)
    if (eventType === 'transaction.completed') {
      const { data: profile } = await supabase.from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (profile) {
        await supabase.from('profiles')
          .update({
            is_pro: true,
            pro_activated_at: new Date().toISOString()
          })
          .eq('email', email);
      }
    }

  } catch (err) {
    console.error('Webhook processing error:', err);
  }

  // Always return 200 so Paddle doesn't retry
  return res.status(200).json({ received: true });
}
