// api/admin/users.js
// Returns all profiles + payments for the admin panel.
// Protected by ADMIN_KEY environment variable.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth check
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [profilesRes, paymentsRes, activationsRes] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('payments').select('*').order('created_at', { ascending: false }),
    supabase.from('activations').select('email, activated_at, user_agent').order('activated_at', { ascending: false }).limit(50)
  ]);

  return res.status(200).json({
    profiles: profilesRes.data || [],
    payments: paymentsRes.data || [],
    activations: activationsRes.data || [],
    stats: {
      totalUsers: profilesRes.data?.length || 0,
      proUsers: profilesRes.data?.filter(p => p.is_pro).length || 0,
      pendingPayments: paymentsRes.data?.filter(p => p.status === 'pending').length || 0,
    }
  });
}
