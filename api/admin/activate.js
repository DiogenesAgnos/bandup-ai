// api/admin/activate.js
// Manual Pro activation — works for both existing and new users.
// If user has an account → upgrades to Pro.
// If user doesn't → creates account with temp password, then upgrades.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const generateTempPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 6; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return 'EF-' + pwd;
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

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  const normalizedEmail = email.toLowerCase().trim();

  // Check if user already has a profile
  const { data: existingProfile } = await supabase.from('profiles')
    .select('id, email, name, is_pro')
    .eq('email', normalizedEmail)
    .maybeSingle();

  let tempPassword = null;
  let accountCreated = false;
  let userName = normalizedEmail.split('@')[0];

  if (existingProfile) {
    // User exists → just upgrade to Pro
    userName = existingProfile.name || userName;

    if (existingProfile.is_pro) {
      return res.status(200).json({
        success: true,
        accountCreated: false,
        email: normalizedEmail,
        alreadyPro: true,
        whatsappMessage: `Hi ${userName}! Your Englishfool account (${normalizedEmail}) is already Pro. Sign in at englishfool.com to enjoy unlimited access! 🎓`
      });
    }

    const { error: proErr } = await supabase.from('profiles')
      .update({ is_pro: true, pro_activated_at: new Date().toISOString() })
      .eq('email', normalizedEmail);
    if (proErr) {
      return res.status(500).json({ success: false, error: 'Failed to activate: ' + proErr.message });
    }
  } else {
    // User doesn't exist → create account
    tempPassword = generateTempPassword();
    const { error: authErr } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: userName }
    });

    if (authErr) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create account: ' + authErr.message
      });
    }
    accountCreated = true;

    // Wait for trigger to create profile
    await new Promise(r => setTimeout(r, 1500));

    // Activate Pro
    const { error: proErr } = await supabase.from('profiles')
      .update({ is_pro: true, pro_activated_at: new Date().toISOString() })
      .eq('email', normalizedEmail);
    if (proErr) console.error('Pro activation error:', proErr);
  }

  // Log to activations table
  try {
    await supabase.from('activations').insert({
      email: normalizedEmail,
      name: userName,
      temp_password: tempPassword,
      is_pro: true,
      activated_at: new Date().toISOString()
    });
  } catch (e) { console.error('Activation log error:', e); }

  // Build WhatsApp message
  let whatsappMessage;
  if (accountCreated) {
    whatsappMessage = `Hi! Your Englishfool Pro account is ready 🎓\n\n` +
      `📧 Email: ${normalizedEmail}\n🔑 Password: ${tempPassword}\n\n` +
      `Go to englishfool.com → click Sign In → use these credentials.\n` +
      `You can change your password after signing in from the menu.\n\nEnjoy unlimited access!`;
  } else {
    whatsappMessage = `Hi ${userName}! Your Englishfool Pro has been activated 🎓\n\n` +
      `Just sign in at englishfool.com with ${normalizedEmail} and enjoy unlimited access!`;
  }

  return res.status(200).json({
    success: true,
    accountCreated,
    email: normalizedEmail,
    tempPassword,
    whatsappMessage
  });
}
