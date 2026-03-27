// api/cliq/request.js
// Saves a CLIQ payment request to the database and emails Ahmad.

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

  const { name, email, mobile } = req.body || {};
  if (!name || !email || !mobile) {
    return res.status(400).json({ error: 'Name, email, and mobile are required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Save to payments table
  const { error: insertErr } = await supabase.from('payments').insert({
    email: normalizedEmail,
    name: name.trim(),
    mobile: mobile.trim(),
    amount: 17,
    currency: 'JOD',
    method: 'cliq',
    status: 'pending'
  });

  if (insertErr) {
    console.error('Payment insert error:', insertErr);
    // Don't fail the request — the email is the primary notification
  }

  return res.status(200).json({ success: true });
}
