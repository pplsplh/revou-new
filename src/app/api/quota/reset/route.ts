import { NextRequest, NextResponse } from 'next/server';
import { resetAllFreeUserQuotas } from '@/lib/quota-manager';

/**
 * POST /api/quota/reset
 *
 * Cron endpoint untuk mereset kuota harian semua Free_User ke 0.
 * Dipanggil setiap hari pukul 00:00 WIB (17:00 UTC sehari sebelumnya).
 *
 * Keamanan: endpoint ini dilindungi dengan header `Authorization` yang
 * harus berisi secret token yang sama dengan `CRON_SECRET` di environment.
 *
 * Contoh konfigurasi Vercel Cron (vercel.json):
 * {
 *   "crons": [
 *     {
 *       "path": "/api/quota/reset",
 *       "schedule": "0 17 * * *"   // 17:00 UTC = 00:00 WIB
 *     }
 *   ]
 * }
 *
 * Requirements: 3.6
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Verifikasi secret header ──────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[quota/reset] CRON_SECRET environment variable is not set');
    return NextResponse.json(
      { error: { code: 'SERVER_MISCONFIGURATION', message: 'Server tidak dikonfigurasi dengan benar.' } },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  const expectedHeader = `Bearer ${cronSecret}`;

  if (!authHeader || authHeader !== expectedHeader) {
    console.warn('[quota/reset] Unauthorized cron request — invalid or missing Authorization header');
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Akses tidak diizinkan.' } },
      { status: 401 }
    );
  }

  // ── Jalankan reset kuota ──────────────────────────────────────────────────
  try {
    const startTime = Date.now();
    const { resetCount } = await resetAllFreeUserQuotas();
    const durationMs = Date.now() - startTime;

    console.info(`[quota/reset] Reset berhasil: ${resetCount} record diperbarui dalam ${durationMs}ms`);

    return NextResponse.json(
      {
        success: true,
        resetCount,
        durationMs,
        resetAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[quota/reset] Gagal mereset kuota:', message);

    return NextResponse.json(
      {
        error: {
          code: 'RESET_FAILED',
          message: 'Gagal mereset kuota. Silakan coba lagi.',
          ...(process.env.NODE_ENV === 'development' && { details: message }),
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/quota/reset
 *
 * Health check endpoint — mengembalikan informasi tentang endpoint ini.
 * Tidak memerlukan autentikasi.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      endpoint: '/api/quota/reset',
      description: 'Cron endpoint untuk mereset kuota harian Free_User',
      schedule: '0 17 * * * (17:00 UTC = 00:00 WIB)',
      method: 'POST',
      auth: 'Bearer token via Authorization header (CRON_SECRET)',
    },
    { status: 200 }
  );
}
