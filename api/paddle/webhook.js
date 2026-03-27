// api/paddle/webhook.js
// Paddle calls this URL when a payment succeeds — auto-activates Pro.
// Set this URL in Paddle Dashboard → Notifications → Add Endpoint:
//   https://englishfool.com/api/paddle/webhook

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const event = req.body;
    console.log('Paddle webhook event:', event?.event_type);

    // Handle successful payment or subscription activation
    const ACTIVATE_EVENTS = [
      'subscription.activated',
      'subscription.updated',
      'transaction.completed'
    ];

    if (ACTIVATE_EVENTS.includes(event?.event_type)) {
      const email = event?.data?.customer?.email;
      const subscriptionId = event?.data?.id;
      const amount = event?.data?.details?.totals?.total;

      if (!email) {
        console.error('No email in Paddle webhook:', event);
        return res.status(200).json({ received: true, warning: 'No email found' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Activate Pro
      await supabase.from('profiles')
        .update({ is_pro: true, pro_activated_at: new Date().toISOString() })
        .eq('email', normalizedEmail);

      // Log payment
      await supabase.from('payments').insert({
        email: normalizedEmail,
        amount: amount ? parseFloat(amount) / 100 : 25,
        currency: 'USD',
        method: 'paddle',
        status: 'confirmed',
        paddle_subscription_id: subscriptionId || null
      });

      console.log('Pro activated for:', normalizedEmail);
    }

    // Handle subscription cancellation
    if (event?.event_type === 'subscription.canceled') {
      const email = event?.data?.customer?.email;
      if (email) {
        await supabase.from('profiles')
          .update({ is_pro: false })
          .eq('email', email.toLowerCase().trim());
        console.log('Pro deactivated for:', email);
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Paddle webhook error:', err);
    // Always return 200 so Paddle doesn't retry
    return res.status(200).json({ received: true, error: err.message });
  }
}
