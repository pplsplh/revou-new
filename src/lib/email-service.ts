import { Resend } from 'resend';

// ─── Resend Client (lazy-initialized) ────────────────────────────────────────

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email-service] RESEND_API_KEY tidak dikonfigurasi — email tidak akan dikirim.');
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'noreply@ai-content-generator.id';
const APP_NAME = 'AI Content Generator';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ai-content-generator.id';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── HTML Template Helpers ────────────────────────────────────────────────────

function wrapEmailTemplate(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background-color: #4F46E5; padding: 24px 32px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
    .body { padding: 32px; color: #333333; line-height: 1.6; }
    .body p { margin: 0 0 16px; }
    .button { display: inline-block; padding: 12px 28px; background-color: #4F46E5; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 8px 0; }
    .footer { padding: 20px 32px; background-color: #f9f9f9; color: #888888; font-size: 12px; border-top: 1px solid #eeeeee; }
    .divider { border: none; border-top: 1px solid #eeeeee; margin: 24px 0; }
    .highlight { background-color: #f0f0ff; border-left: 4px solid #4F46E5; padding: 12px 16px; border-radius: 4px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${APP_NAME}</h1>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>Email ini dikirim secara otomatis oleh ${APP_NAME}. Jangan balas email ini.</p>
      <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. Semua hak dilindungi.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ─── Email Functions ──────────────────────────────────────────────────────────

/**
 * Mengirimkan email verifikasi akun kepada pengguna baru.
 *
 * Implementasi graceful degradation: jika Resend tidak tersedia atau gagal,
 * fungsi ini mengembalikan `{ success: false }` tanpa melempar exception,
 * sehingga proses registrasi tetap dapat diselesaikan.
 *
 * Requirements: 1.2
 */
export async function sendVerificationEmail(
  to: string,
  name: string,
  verificationToken: string
): Promise<EmailResult> {
  const resend = getResendClient();

  if (!resend) {
    // Graceful degradation: log dan kembalikan failure tanpa throw
    console.error('[email-service] sendVerificationEmail: Resend tidak tersedia, email tidak dikirim.');
    return { success: false, error: 'Email service tidak tersedia.' };
  }

  const verificationUrl = `${APP_URL}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;

  const bodyHtml = `
    <p>Halo, <strong>${name}</strong>!</p>
    <p>Terima kasih telah mendaftar di <strong>${APP_NAME}</strong>. Untuk mengaktifkan akun Anda, silakan klik tombol di bawah ini:</p>
    <p>
      <a href="${verificationUrl}" class="button">Verifikasi Email Saya</a>
    </p>
    <p>Atau salin dan tempel tautan berikut ke browser Anda:</p>
    <div class="highlight">
      <p style="word-break: break-all; margin: 0;">${verificationUrl}</p>
    </div>
    <hr class="divider" />
    <p style="color: #888888; font-size: 13px;">Tautan verifikasi ini berlaku selama <strong>24 jam</strong>. Jika Anda tidak mendaftar di ${APP_NAME}, abaikan email ini.</p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Verifikasi Email Anda — ${APP_NAME}`,
      html: wrapEmailTemplate('Verifikasi Email', bodyHtml),
    });

    if (error) {
      console.error('[email-service] sendVerificationEmail gagal:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    // Graceful degradation: tangkap semua error agar registrasi tidak terganggu
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[email-service] sendVerificationEmail exception:', message);
    return { success: false, error: message };
  }
}

/**
 * Mengirimkan email reset password kepada pengguna.
 *
 * Tautan reset berlaku selama 1 jam sesuai Requirement 1.8.
 *
 * Requirements: 1.8
 */
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetToken: string
): Promise<EmailResult> {
  const resend = getResendClient();

  if (!resend) {
    console.error('[email-service] sendPasswordResetEmail: Resend tidak tersedia, email tidak dikirim.');
    return { success: false, error: 'Email service tidak tersedia.' };
  }

  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const bodyHtml = `
    <p>Halo, <strong>${name}</strong>!</p>
    <p>Kami menerima permintaan untuk mereset password akun Anda di <strong>${APP_NAME}</strong>. Klik tombol di bawah untuk membuat password baru:</p>
    <p>
      <a href="${resetUrl}" class="button">Reset Password Saya</a>
    </p>
    <p>Atau salin dan tempel tautan berikut ke browser Anda:</p>
    <div class="highlight">
      <p style="word-break: break-all; margin: 0;">${resetUrl}</p>
    </div>
    <hr class="divider" />
    <p style="color: #888888; font-size: 13px;">Tautan ini berlaku selama <strong>1 jam</strong>. Jika Anda tidak meminta reset password, abaikan email ini — akun Anda tetap aman.</p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Reset Password Anda — ${APP_NAME}`,
      html: wrapEmailTemplate('Reset Password', bodyHtml),
    });

    if (error) {
      console.error('[email-service] sendPasswordResetEmail gagal:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[email-service] sendPasswordResetEmail exception:', message);
    return { success: false, error: message };
  }
}

/**
 * Mengirimkan email konfirmasi pembayaran berhasil dan langganan aktif.
 *
 * Requirements: 4.6, 4.7
 */
export async function sendPaymentConfirmationEmail(
  to: string,
  name: string,
  options: {
    transactionId: string;
    amount: number;
    paymentMethod: string;
    paidAt: Date;
    expiresAt: Date;
  }
): Promise<EmailResult> {
  const resend = getResendClient();

  if (!resend) {
    console.error('[email-service] sendPaymentConfirmationEmail: Resend tidak tersedia, email tidak dikirim.');
    return { success: false, error: 'Email service tidak tersedia.' };
  }

  const { transactionId, amount, paymentMethod, paidAt, expiresAt } = options;

  const formattedAmount = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);

  const formattedPaidAt = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(paidAt);

  const formattedExpiresAt = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(expiresAt);

  const dashboardUrl = `${APP_URL}/dashboard/subscription`;

  const bodyHtml = `
    <p>Halo, <strong>${name}</strong>!</p>
    <p>Pembayaran Anda telah berhasil diproses. Langganan <strong>Unlimited Plan</strong> Anda kini aktif!</p>
    <div class="highlight">
      <p><strong>Detail Transaksi:</strong></p>
      <p>ID Transaksi: <code>${transactionId}</code></p>
      <p>Jumlah: <strong>${formattedAmount}</strong></p>
      <p>Metode Pembayaran: ${paymentMethod}</p>
      <p>Tanggal Pembayaran: ${formattedPaidAt}</p>
      <p>Langganan Aktif Hingga: <strong>${formattedExpiresAt}</strong></p>
    </div>
    <p>Sekarang Anda dapat menikmati generate konten tanpa batas! Mulai buat konten produk Anda sekarang:</p>
    <p>
      <a href="${APP_URL}/generate" class="button">Mulai Generate Konten</a>
    </p>
    <p>Lihat detail langganan Anda di <a href="${dashboardUrl}">halaman langganan</a>.</p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Pembayaran Berhasil — Langganan Unlimited Aktif 🎉`,
      html: wrapEmailTemplate('Konfirmasi Pembayaran', bodyHtml),
    });

    if (error) {
      console.error('[email-service] sendPaymentConfirmationEmail gagal:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[email-service] sendPaymentConfirmationEmail exception:', message);
    return { success: false, error: message };
  }
}

/**
 * Mengirimkan email notifikasi pembayaran gagal atau kedaluwarsa.
 *
 * Hanya dikirim ketika pembayaran benar-benar gagal/kedaluwarsa,
 * bukan saat proses pembayaran masih berlangsung.
 *
 * Requirements: 4.6
 */
export async function sendPaymentFailedEmail(
  to: string,
  name: string,
  options: {
    transactionId: string;
    amount: number;
    reason: 'failed' | 'expired';
  }
): Promise<EmailResult> {
  const resend = getResendClient();

  if (!resend) {
    console.error('[email-service] sendPaymentFailedEmail: Resend tidak tersedia, email tidak dikirim.');
    return { success: false, error: 'Email service tidak tersedia.' };
  }

  const { transactionId, amount, reason } = options;

  const formattedAmount = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);

  const reasonText =
    reason === 'expired'
      ? 'kedaluwarsa sebelum pembayaran diselesaikan'
      : 'tidak dapat diproses';

  const checkoutUrl = `${APP_URL}/dashboard/subscription`;

  const bodyHtml = `
    <p>Halo, <strong>${name}</strong>!</p>
    <p>Sayangnya, pembayaran Anda untuk <strong>Unlimited Plan</strong> ${reasonText}.</p>
    <div class="highlight">
      <p><strong>Detail Transaksi:</strong></p>
      <p>ID Transaksi: <code>${transactionId}</code></p>
      <p>Jumlah: ${formattedAmount}</p>
      <p>Status: <strong style="color: #dc2626;">${reason === 'expired' ? 'Kedaluwarsa' : 'Gagal'}</strong></p>
    </div>
    <p>Jangan khawatir! Anda dapat mencoba kembali kapan saja. Klik tombol di bawah untuk melakukan pembayaran ulang:</p>
    <p>
      <a href="${checkoutUrl}" class="button">Coba Bayar Lagi</a>
    </p>
    <p>Jika Anda mengalami masalah, silakan hubungi tim dukungan kami.</p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Pembayaran ${reason === 'expired' ? 'Kedaluwarsa' : 'Gagal'} — ${APP_NAME}`,
      html: wrapEmailTemplate('Pembayaran Gagal', bodyHtml),
    });

    if (error) {
      console.error('[email-service] sendPaymentFailedEmail gagal:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[email-service] sendPaymentFailedEmail exception:', message);
    return { success: false, error: message };
  }
}

/**
 * Mengirimkan email pengingat perpanjangan langganan ketika langganan
 * akan kedaluwarsa dalam 3 hari.
 *
 * Requirements: 4.8
 */
export async function sendSubscriptionRenewalReminderEmail(
  to: string,
  name: string,
  options: {
    expiresAt: Date;
    daysRemaining: number;
  }
): Promise<EmailResult> {
  const resend = getResendClient();

  if (!resend) {
    console.error('[email-service] sendSubscriptionRenewalReminderEmail: Resend tidak tersedia, email tidak dikirim.');
    return { success: false, error: 'Email service tidak tersedia.' };
  }

  const { expiresAt, daysRemaining } = options;

  const formattedExpiresAt = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(expiresAt);

  const renewUrl = `${APP_URL}/dashboard/subscription`;

  const urgencyText =
    daysRemaining === 1
      ? 'besok'
      : `dalam ${daysRemaining} hari lagi`;

  const bodyHtml = `
    <p>Halo, <strong>${name}</strong>!</p>
    <p>Langganan <strong>Unlimited Plan</strong> Anda akan berakhir <strong>${urgencyText}</strong> (${formattedExpiresAt}).</p>
    <p>Perpanjang sekarang agar Anda tidak kehilangan akses generate konten tanpa batas!</p>
    <div class="highlight">
      <p><strong>Paket:</strong> Unlimited Plan</p>
      <p><strong>Harga:</strong> Rp29.000 / bulan</p>
      <p><strong>Kedaluwarsa:</strong> ${formattedExpiresAt}</p>
    </div>
    <p>
      <a href="${renewUrl}" class="button">Perpanjang Langganan Sekarang</a>
    </p>
    <p style="color: #888888; font-size: 13px;">Jika Anda tidak memperpanjang, akun Anda akan kembali ke paket gratis dengan batas 5 generate per hari setelah tanggal kedaluwarsa.</p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Pengingat: Langganan Anda Berakhir ${urgencyText} — ${APP_NAME}`,
      html: wrapEmailTemplate('Pengingat Perpanjangan Langganan', bodyHtml),
    });

    if (error) {
      console.error('[email-service] sendSubscriptionRenewalReminderEmail gagal:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[email-service] sendSubscriptionRenewalReminderEmail exception:', message);
    return { success: false, error: message };
  }
}
