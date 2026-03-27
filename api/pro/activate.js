// api/pro/activate.js
// Verifies activation code SERVER-SIDE (salt is never exposed to the browser)
// and sets is_pro = true in Supabase.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service key — full DB access, server-only
);

// Same algorithm as before but now the salt lives ONLY in Vercel env vars
const generateCode = (email) => {
  const SALT = process.env.ACTIVATION_SALT || 'EF-Efool2026-JO-secret';
  const input = email.toLowerCase().trim() + SALT;
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h >>> 0;
  }
  const b = h.toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
  return `EFOOL-${b.slice(0, 4)}-${b.slice(4, 8)}`;
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'Email and code are required.' });

  const normalizedEmail = email.toLowerCase().trim();
  const expected = generateCode(normalizedEmail);

  if (code.trim().toUpperCase() !== expected) {
    return res.status(401).json({
      error: 'Invalid code. Make sure you are using the exact email you registered with, and the code is entered correctly (e.g. EFOOL-XXXX-XXXX).'
    });
  }

  // Check user exists in profiles
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, is_pro')
    .eq('email', normalizedEmail)
    .single();

  if (profileErr || !profile) {
    return res.status(404).json({
      error: 'No account found with this email. Please register first, then enter your code.'
    });
  }

  if (profile.is_pro) {
    return res.status(200).json({ success: true, alreadyPro: true });
  }

  // Activate Pro
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ is_pro: true, pro_activated_at: new Date().toISOString() })
    .eq('id', profile.id);

  if (updateErr) {
    console.error('Pro update error:', updateErr);
    return res.status(500).json({ error: 'Activation failed. Please try again.' });
  }

  // Log activation for sharing detection
  await supabase.from('activations').insert({
    email: normalizedEmail,
    user_agent: req.headers['user-agent'] || '',
    ip_hint: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
  });

  return res.status(200).json({ success: true });
}
