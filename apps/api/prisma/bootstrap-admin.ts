// Secure first-admin bootstrap: no default password. Refuses to run if a SUPER_ADMIN already exists unless --if-absent is passed.
import '../src/env';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
(async () => {
  const db = new PrismaClient();
  try {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const pw = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const ifAbsent = process.argv.includes('--if-absent');
    if (!email || !pw || pw.length < 14) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and a 14+ char BOOTSTRAP_ADMIN_PASSWORD');
    if (await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } })) {
      if (ifAbsent) {
        console.log('Super admin already exists; skipping bootstrap. Remove BOOTSTRAP_ADMIN_PASSWORD from your environment now.');
        return;
      }
      throw new Error('Super admin already exists');
    }
    await db.user.create({ data: { email, name: 'Super Admin', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(pw, 12) } });
    console.log('Super admin created. Remove the password from your environment now.');
  } finally {
    await db.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
