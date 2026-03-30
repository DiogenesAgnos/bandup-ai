// api/paddle/activate.js
// Called client-side after Paddle checkout completes.
// Activates Pro for the given email in Supabase.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  const normalizedEmail = email.toLowerCase().trim();

  // Check if profile exists
  const { data: profile } = await supabase.from('profiles')
    .select('id, is_pro')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (profile) {
    // Update existing profile to Pro
    const { error } = await supabase.from('profiles')
      .update({
        is_pro: true,
        pro_activated_at: new Date().toISOString(),
        pro_source: 'paddle'
      })
      .eq('email', normalizedEmail);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    // User hasn't registered yet — store activation for later
    // When they register, the app will check and activate Pro
    try {
      await supabase.from('activations').insert({
        email: normalizedEmail,
        is_pro: true,
        activated_at: new Date().toISOString()
      });
    } catch (e) { console.error('Activation log error:', e); }
  }

  return res.status(200).json({ success: true, email: normalizedEmail });
}
