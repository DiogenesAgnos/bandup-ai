// api/admin/confirm.js
// Confirms a CLIQ payment and activates Pro for the user.
// If user already registered → updates profile to Pro directly.
// If user hasn't registered yet → stores activation so Pro kicks in when they sign up.
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const generateCode = (email) => {
  const SALT = process.env.ACTIVATION_SALT || 'EF-Efool2026-JO-secret';
  const input = email.toLowerCase().trim() + SALT;
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h >>> 0;
  }
  const b = h.toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
  return `EFOOL-${b.slice(0,4)}-${b.slice(4,8)}`;
};
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { paymentId, email } = req.body || {};
  if (!paymentId || !email) return res.status(400).json({ error: 'paymentId and email required' });
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Mark payment as confirmed
  const { error: payErr } = await supabase.from('payments')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', paymentId);
  if (payErr) console.error('Payment confirm error:', payErr);

  // 2. Check if user already has a profile (i.e. they registered)
  const { data: existing } = await supabase.from('profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existing) {
    // User already registered → activate Pro directly
    const { error: proErr } = await supabase.from('profiles')
      .update({ is_pro: true, pro_activated_at: new Date().toISOString() })
      .eq('email', normalizedEmail);
    if (proErr) console.error('Pro activation error:', proErr);
  } else {
    // User hasn't registered yet → save activation for later
    // When they register and log in, the app will check this table
    const { error: actErr } = await supabase.from('activations')
      .upsert({
        email: normalizedEmail,
        is_pro: true,
        activated_at: new Date().toISOString()
      }, { onConflict: 'email' });
    if (actErr) console.error('Activation save error:', actErr);
  }

  // 3. Generate the code to send via WhatsApp
  const code = generateCode(normalizedEmail);
  return res.status(200).json({
    success: true,
    code,
    proActivated: !!existing,
    pendingRegistration: !existing,
    whatsappMessage: existing
      ? `Hi! Your Englishfool Pro is now active. Just sign in at englishfool.com with ${normalizedEmail} and enjoy unlimited access! 🎓`
      : `Hi! Your Englishfool Pro code is: ${code} — Go to englishfool.com → Register with ${normalizedEmail} → then click Upgrade to Pro → Enter Code tab → type your email and this code. Enjoy! 🎓`
  });
}
