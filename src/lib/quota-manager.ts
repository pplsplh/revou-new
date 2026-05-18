import { prisma } from './prisma';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface QuotaStatus {
  userId: string;
  used: number;
  limit: number; // 5 untuk Free_User, Infinity untuk Subscriber
  resetAt: Date; // 00:00 WIB hari berikutnya
  isSubscriber: boolean;
}

export interface QuotaCheckResult {
  allowed: boolean;
  isSubscriber?: boolean;
  remaining?: number;
  used?: number;
  limit?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Menghitung waktu reset berikutnya: 00:00 WIB (UTC+7) hari berikutnya.
 */
function getNextResetAt(): Date {
  // WIB = UTC+7
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

  const nowUtc = Date.now();
  const nowWib = nowUtc + WIB_OFFSET_MS;

  // Awal hari ini dalam WIB (midnight WIB)
  const todayMidnightWib = Math.floor(nowWib / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);

  // Midnight WIB besok
  const tomorrowMidnightWib = todayMidnightWib + 24 * 60 * 60 * 1000;

  // Konversi kembali ke UTC
  const tomorrowMidnightUtc = tomorrowMidnightWib - WIB_OFFSET_MS;

  return new Date(tomorrowMidnightUtc);
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Memeriksa apakah user diizinkan melakukan generate konten dan mengurangi
 * kuota sebesar 1 jika diizinkan. Operasi ini bersifat atomik menggunakan
 * `prisma.$transaction` untuk mencegah race condition.
 *
 * - Subscriber (langganan aktif): selalu diizinkan, kuota tidak dikurangi.
 * - Free_User dengan sisa kuota > 0: diizinkan, kuota dikurangi 1.
 * - Free_User dengan kuota habis: ditolak, kuota tidak berubah.
 *
 * Requirements: 3.3, 3.4, 3.5
 */
export async function checkAndDecrementQuota(userId: string): Promise<QuotaCheckResult> {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        dailyQuota: true,
      },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Subscriber dengan langganan aktif: bypass kuota sepenuhnya (Req 3.5)
    if (user.subscription?.isActive) {
      return {
        allowed: true,
        isSubscriber: true,
      } satisfies QuotaCheckResult;
    }

    // Pastikan DailyQuota ada; jika belum, inisialisasi terlebih dahulu
    let quota = user.dailyQuota;
    if (!quota) {
      quota = await tx.dailyQuota.create({
        data: {
          userId,
          used: 0,
          limit: 5,
          resetAt: getNextResetAt(),
        },
      });
    }

    // Kuota habis: tolak permintaan (Req 3.4)
    if (quota.used >= quota.limit) {
      return {
        allowed: false,
        remaining: 0,
        used: quota.used,
        limit: quota.limit,
      } satisfies QuotaCheckResult;
    }

    // Kurangi kuota sebesar 1 secara atomik (Req 3.3)
    const updated = await tx.dailyQuota.update({
      where: { userId },
      data: { used: { increment: 1 } },
    });

    return {
      allowed: true,
      isSubscriber: false,
      remaining: updated.limit - updated.used,
      used: updated.used,
      limit: updated.limit,
    } satisfies QuotaCheckResult;
  });
}

/**
 * Mengambil status kuota saat ini untuk user tertentu tanpa mengubah data.
 *
 * Requirements: 3.1, 3.2
 */
export async function getQuotaStatus(userId: string): Promise<QuotaStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: true,
      dailyQuota: true,
    },
  });

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const isSubscriber = user.subscription?.isActive ?? false;

  // Subscriber: limit tak terbatas
  if (isSubscriber) {
    return {
      userId,
      used: 0,
      limit: Infinity,
      resetAt: getNextResetAt(),
      isSubscriber: true,
    };
  }

  // Free_User: gunakan data DailyQuota yang ada atau default
  const quota = user.dailyQuota;
  if (!quota) {
    // Belum ada record; kembalikan status default
    return {
      userId,
      used: 0,
      limit: 5,
      resetAt: getNextResetAt(),
      isSubscriber: false,
    };
  }

  return {
    userId,
    used: quota.used,
    limit: quota.limit,
    resetAt: quota.resetAt,
    isSubscriber: false,
  };
}

/**
 * Mereset kuota harian semua Free_User ke `used = 0`.
 *
 * Operasi ini bersifat idempotent: menjalankannya beberapa kali menghasilkan
 * hasil yang sama (set `used = 0`, bukan decrement). Hanya mempengaruhi user
 * yang TIDAK memiliki langganan aktif.
 *
 * Requirements: 3.6
 */
export async function resetAllFreeUserQuotas(): Promise<{ resetCount: number }> {
  const nextResetAt = getNextResetAt();

  // Update semua DailyQuota milik user yang tidak memiliki subscription aktif.
  // Menggunakan updateMany dengan filter relasi untuk efisiensi.
  const result = await prisma.dailyQuota.updateMany({
    where: {
      user: {
        subscription: {
          // Hanya reset user yang bukan Subscriber aktif
          OR: [
            { isActive: false },
            // User yang sama sekali tidak punya subscription record
          ],
        },
      },
    },
    data: {
      used: 0, // Set ke 0 (idempotent), bukan decrement
      resetAt: nextResetAt,
    },
  });

  // Juga reset DailyQuota milik user yang tidak punya subscription record sama sekali
  const resultNoSub = await prisma.dailyQuota.updateMany({
    where: {
      user: {
        subscription: null,
      },
    },
    data: {
      used: 0,
      resetAt: nextResetAt,
    },
  });

  return { resetCount: result.count + resultNoSub.count };
}

/**
 * Membuat record DailyQuota baru untuk user baru dengan `used = 0` dan
 * `limit = 5`. Jika record sudah ada, tidak melakukan apa-apa (upsert).
 *
 * Requirements: 3.1
 */
export async function initializeUserQuota(userId: string): Promise<void> {
  await prisma.dailyQuota.upsert({
    where: { userId },
    update: {}, // Tidak mengubah apa pun jika sudah ada
    create: {
      userId,
      used: 0,
      limit: 5,
      resetAt: getNextResetAt(),
    },
  });
}
