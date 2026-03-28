// api/admin/confirm.js
// Confirms a CLIQ payment:
// 1. Marks payment as confirmed
// 2. Creates a real Supabase Auth account (if user hasn't registered yet)
// 3. Activates Pro on their profile
// 4. Returns credentials so Ahmad can WhatsApp them
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service key can create users
);

// Generate a simple temporary password like "EF-a3f7k2"
const generateTempPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 6; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return 'EF-' + pwd;
};

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

  // 1. Get payment details
  const { data: payment } = await supabase.from('payments')
    .select('name, mobile')
    .eq('id', paymentId)
    .single();

  // 2. Mark payment as confirmed
  const { error: payErr } = await supabase.from('payments')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', paymentId);
  if (payErr) console.error('Payment confirm error:', payErr);

  // 3. Check if user already exists in auth
  const { data: existingProfile } = await supabase.from('profiles')
    .select('id, email')
    .eq('email', normalizedEmail)
    .maybeSingle();

  let tempPassword = null;
  let accountCreated = false;

  if (!existingProfile) {
    // User hasn't registered yet → create their account
    tempPassword = generateTempPassword();
    const { data: newUser, error: authErr } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,           // skip email verification
      user_metadata: { name: payment?.name || normalizedEmail.split('@')[0] }
    });

    if (authErr) {
      console.error('Auth create error:', authErr);
      return res.status(500).json({
        success: false,
        error: 'Failed to create account: ' + authErr.message
      });
    }
    accountCreated = true;

    // Wait a moment for the trigger to create the profile
    await new Promise(r => setTimeout(r, 1000));
  }

  // 4. Activate Pro on the profile
  const { error: proErr } = await supabase.from('profiles')
    .update({ is_pro: true, pro_activated_at: new Date().toISOString() })
    .eq('email', normalizedEmail);
  if (proErr) console.error('Pro activation error:', proErr);

  // 5. Generate activation code (backup method)
  const code = generateCode(normalizedEmail);

  // 6. Build WhatsApp message
  let whatsappMessage;
  if (accountCreated) {
    whatsappMessage = `Hi ${payment?.name || ''}! Your Englishfool Pro account is ready 🎓\n\n` +
      `📧 Email: ${normalizedEmail}\n🔑 Password: ${tempPassword}\n\n` +
      `Go to englishfool.com → click Sign In → use these credentials.\n` +
      `Please change your password after signing in.\n\nEnjoy unlimited access!`;
  } else {
    whatsappMessage = `Hi ${payment?.name || ''}! Your Englishfool Pro has been activated 🎓\n\n` +
      `Just sign in at englishfool.com with ${normalizedEmail} and enjoy unlimited access!`;
  }

  return res.status(200).json({
    success: true,
    code,
    accountCreated,
    tempPassword,
    whatsappMessage
  });
}
