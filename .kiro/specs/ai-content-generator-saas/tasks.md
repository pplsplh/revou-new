# Implementation Plan: AI Content Generator SaaS

## Overview

Implementasi platform SaaS berbasis Next.js 14 (App Router) untuk menghasilkan konten marketplace Indonesia secara otomatis menggunakan AI. Rencana ini membangun sistem secara inkremental: mulai dari fondasi database dan autentikasi, lalu fitur inti generate konten, manajemen kuota, pembayaran/langganan, hingga dashboard pengguna.

## Tasks

- [~] 1. Setup proyek, database schema, dan konfigurasi environment
  - Inisialisasi proyek Next.js 14 dengan App Router, TypeScript, dan Tailwind CSS
  - Install dependensi utama: `prisma`, `@prisma/client`, `next-auth@beta`, `@anthropic-ai/sdk`, `@google/generative-ai`, `midtrans-client`, `stripe`, `resend`, `bcryptjs`, `fast-check`, `vitest`
  - Buat file `prisma/schema.prisma` dengan semua model: `User`, `Account`, `Session`, `VerificationToken`, `Subscription`, `DailyQuota`, `ContentHistory`, `Transaction`, `LoginAttempt`, `PasswordResetToken`
  - Buat file `src/lib/prisma.ts` sebagai Prisma client singleton
  - Konfigurasi environment variables di `.env.local`: `DATABASE_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`
  - Buat file `vitest.config.ts` dan `tests/setup.ts` untuk konfigurasi test environment
  - _Requirements: 8.2, 8.7_

- [ ] 2. Implementasi autentikasi (NextAuth + email/password + Google OAuth)
  - [x] 2.1 Konfigurasi NextAuth v5 dan middleware proteksi route
    - Buat file `src/lib/auth.ts` dengan konfigurasi NextAuth: Credentials provider (email/password) dan Google OAuth 2.0 provider
    - Implementasi session strategy (JWT atau database session, 30 hari)
    - Buat file `src/app/api/auth/[...nextauth]/route.ts`
    - Buat `middleware.ts` di root untuk melindungi route `/dashboard`, `/generate`, `/subscription`
    - _Requirements: 1.5, 1.6_

  - [ ] 2.2 Implementasi Server Actions autentikasi
    - Buat file `src/actions/auth.actions.ts` dengan fungsi: `registerUser`, `loginUser`, `logoutUser`, `sendVerificationEmail`, `verifyEmail`, `sendPasswordResetEmail`, `resetPassword`
    - Implementasi hashing password dengan bcrypt (salt rounds = 12) di `registerUser`
    - Implementasi logika lockout akun: cek `LoginAttempt` dalam 15 menit terakhir; jika ≥5 gagal, tolak login dan kirim email notifikasi
    - Implementasi generic error message untuk login gagal (tidak mengungkapkan field mana yang salah)
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 1.8, 1.9, 1.10, 8.1, 8.3, 8.4_

  - [~] 2.3 Tulis property test untuk autentikasi
    - **Property 9: Password Hashing Correctness** — verifikasi hash bcrypt tidak sama dengan plaintext, `bcrypt.compare(plaintext, hash)` = true, `bcrypt.compare(other, hash)` = false
    - **Validates: Requirements 8.1**
    - **Property 13: Account Lockout After Repeated Failures** — setelah tepat 5 gagal dalam 15 menit, percobaan ke-6 ditolak dengan lockout error
    - **Validates: Requirements 8.4**
    - **Property 14: Generic Login Error Message** — untuk semua kombinasi kredensial salah, pesan error selalu sama (tidak mengungkapkan field mana yang salah)
    - **Validates: Requirements 1.7**

  - [~] 2.4 Buat halaman UI autentikasi
    - Buat `src/app/(auth)/register/page.tsx` dengan form: email, password (min 8 karakter), nama lengkap; validasi client-side
    - Buat `src/app/(auth)/login/page.tsx` dengan form email/password dan tombol "Login dengan Google"
    - Buat `src/app/(auth)/forgot-password/page.tsx` dengan form email untuk reset password
    - _Requirements: 1.1, 1.5_

- [~] 3. Checkpoint — Pastikan semua test autentikasi lulus
  - Pastikan semua test lulus, tanyakan kepada user jika ada pertanyaan.

- [x] 4. Implementasi Email Service
  - [x] 4.1 Buat Email Service dengan Resend
    - Buat file `src/lib/email-service.ts` dengan fungsi: `sendVerificationEmail`, `sendPasswordResetEmail`, `sendPaymentConfirmationEmail`, `sendPaymentFailedEmail`, `sendSubscriptionRenewalReminderEmail`
    - Implementasi graceful degradation: jika Resend tidak tersedia saat registrasi, tetap selesaikan registrasi dan log error
    - _Requirements: 1.2, 4.6, 4.7, 4.8_

- [ ] 5. Implementasi Quota Manager
  - [x] 5.1 Buat Quota Manager dengan operasi atomik
    - Buat file `src/lib/quota-manager.ts` dengan fungsi: `checkAndDecrementQuota`, `getQuotaStatus`, `resetAllFreeUserQuotas`, `initializeUserQuota`
    - Implementasi `checkAndDecrementQuota` menggunakan `prisma.$transaction` untuk mencegah race condition
    - Implementasi `resetAllFreeUserQuotas` yang idempotent: set `used = 0` untuk semua Free_User (bukan decrement)
    - Buat `src/app/api/quota/reset/route.ts` sebagai cron endpoint yang dipanggil setiap 00:00 WIB
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6_

  - [~] 5.2 Tulis property test untuk Quota Manager
    - **Property 1: Quota Decrement Consistency** — untuk Free_User dengan sisa kuota > 0, setelah generate berhasil, `used` bertambah tepat 1 dan `remaining` berkurang tepat 1
    - **Validates: Requirements 3.3**
    - **Property 2: Quota Exhaustion Blocks Generation** — untuk Free_User dengan `used == limit (5)`, setiap percobaan generate ditolak dan `used` tidak berubah
    - **Validates: Requirements 3.4**
    - **Property 3: Subscriber Bypass Quota** — untuk user dengan langganan aktif, generate selalu diizinkan terlepas dari nilai counter kuota
    - **Validates: Requirements 3.5**
    - **Property 4: Quota Reset Idempotency** — setelah reset dijalankan, semua Free_User memiliki `used = 0`; menjalankan reset kedua kali menghasilkan hasil yang sama
    - **Validates: Requirements 3.6**

- [ ] 6. Implementasi AI Service (Claude + Gemini dengan fallback)
  - [~] 6.1 Buat AI Service dengan orkestrasi Claude dan Gemini
    - Buat file `src/lib/ai-service.ts` dengan fungsi: `generateContent`, `buildMarketplacePrompt`, `callClaudeAPI`, `callGeminiAPI`
    - Implementasi `generateContent` dengan `Promise.race` antara Claude API call dan timeout 10 detik; jika Claude gagal/timeout, otomatis fallback ke Gemini API
    - Implementasi `buildMarketplacePrompt` yang menghasilkan prompt berbeda berdasarkan `targetMarketplace` (Tokopedia: 40–70 karakter, Shopee: 25–120 karakter) dan `tone` (formal/santai/promosi)
    - Implementasi sanitasi input sebelum dikirim ke AI untuk mencegah prompt injection
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.5_

  - [~] 6.2 Tulis property test untuk AI Service
    - **Property 8: Input Sanitization Preserves Valid Content** — untuk input produk valid (nama non-empty, kategori valid, ≥3 fitur), setelah sanitasi prompt masih non-empty dan mengandung informasi produk
    - **Validates: Requirements 8.5**
    - **Property 10: Marketplace-Specific Title Length Constraints** — untuk input Tokopedia, panjang judul 40–70 karakter; untuk Shopee, 25–120 karakter; untuk "Semua", maksimal 70 karakter
    - **Validates: Requirements 2.2, 7.1, 7.2, 7.3**
    - **Property 11: AI Fallback Transparency** — ketika Claude API gagal, sistem memanggil Gemini dan mengembalikan konten yang valid
    - **Validates: Requirements 2.4**
    - **Property 12: Tone Selection Affects Prompt Construction** — prompt untuk tone "santai" mengandung instruksi bahasa informal dan emoji; "formal" mengandung instruksi formal tanpa emoji; "promosi" mengandung instruksi persuasif dan CTA
    - **Validates: Requirements 7.5, 7.6, 7.7**

- [ ] 7. Implementasi Content Generator (Server Action + UI)
  - [~] 7.1 Buat Server Action untuk generate konten
    - Buat file `src/actions/content.actions.ts` dengan fungsi: `generateProductContent`, `deleteContentHistory`
    - `generateProductContent`: validasi input (field wajib, minimal 3 fitur), panggil `checkAndDecrementQuota`, panggil `AI_Service.generateContent`, simpan hasil ke `ContentHistory`
    - Implementasi validasi semua field wajib sebelum memanggil AI Service
    - _Requirements: 2.1, 2.2, 2.9, 2.10, 3.3, 3.4_

  - [~] 7.2 Tulis property test untuk Content Actions
    - **Property 5: Content Generation Round-Trip Persistence** — untuk input valid, setelah generate berhasil, query `ContentHistory` mengembalikan record dengan `productName`, `targetMarketplace`, `tone`, `listingTitle`, `productDescription`, `socialCaption` yang sama
    - **Validates: Requirements 2.10**

  - [~] 7.3 Buat halaman UI Content Generator
    - Buat `src/app/(dashboard)/generate/page.tsx` dengan form input: nama produk, kategori, fitur utama (minimal 3 poin), harga (opsional), target marketplace (dropdown), tone (radio/select)
    - Implementasi validasi client-side: tampilkan pesan error pada field kosong, cegah submit jika ada field wajib yang kosong
    - Tampilkan hasil dalam tiga tab: "Judul Listing", "Deskripsi Produk", "Caption"
    - Implementasi tombol "Salin" dengan feedback "Berhasil disalin!" menggunakan Clipboard API
    - Implementasi tombol "Generate Ulang" per jenis konten (hanya regenerate satu jenis tanpa mengubah yang lain)
    - Tampilkan indikator kuota harian untuk Free_User
    - Tampilkan modal upgrade ketika kuota habis
    - _Requirements: 2.1, 2.5, 2.7, 2.8, 2.9, 3.2, 3.4, 3.7_

- [~] 8. Checkpoint — Pastikan semua test quota dan content generation lulus
  - Pastikan semua test lulus, tanyakan kepada user jika ada pertanyaan.

- [ ] 9. Implementasi Payment Service dan Subscription Manager
  - [~] 9.1 Buat Payment Service (Midtrans + Stripe)
    - Buat file `src/lib/payment-service.ts` dengan fungsi: `createMidtransTransaction`, `createStripePaymentIntent`, `verifyMidtransWebhook`, `verifyStripeWebhook`
    - Implementasi `createMidtransTransaction` menggunakan `midtrans-client` Snap API; kembalikan `snapToken`
    - Implementasi `createStripePaymentIntent`; kembalikan `clientSecret`
    - Pastikan tidak ada raw card data yang disimpan ke database — hanya simpan `gatewayOrderId` (token/payment intent ID)
    - Buat `src/app/api/payment/create/route.ts` untuk membuat transaksi baru
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 8.6_

  - [~] 9.2 Buat Webhook Handlers untuk konfirmasi pembayaran
    - Buat `src/app/api/webhooks/midtrans/route.ts`: verifikasi signature Midtrans, cek idempotency (jika transaksi sudah SUCCESS, return 200 tanpa proses ulang), aktifkan subscription dalam atomic transaction
    - Buat `src/app/api/webhooks/stripe/route.ts`: verifikasi Stripe webhook signature, proses event `payment_intent.succeeded`, aktifkan subscription
    - Implementasi aktivasi subscription dalam waktu maksimal 60 detik setelah webhook diterima
    - _Requirements: 4.5, 4.6_

  - [~] 9.3 Buat Subscription Manager
    - Buat file `src/lib/subscription-manager.ts` dengan fungsi: `activateSubscription`, `renewSubscription`, `checkAndExpireSubscriptions`, `getSubscriptionStatus`
    - `activateSubscription`: set `isActive = true`, `startDate = now()`, `expiresAt = now() + 30 hari`, kirim email konfirmasi
    - `renewSubscription`: set `expiresAt = expiresAt + 30 hari` (bukan dari tanggal bayar), hanya jika langganan masih aktif
    - `checkAndExpireSubscriptions`: downgrade user ke Free_User jika `expiresAt < now()`
    - Buat cron endpoint `src/app/api/subscription/check-expiry/route.ts` untuk menjalankan `checkAndExpireSubscriptions` harian
    - _Requirements: 4.7, 4.8, 4.9, 6.1, 6.2, 6.4, 6.5_

  - [~] 9.4 Tulis property test untuk Payment dan Subscription
    - **Property 6: Webhook Activates Subscription with Correct Expiry** — untuk transaksi PENDING, ketika webhook `settlement`/`capture` diterima, subscription diaktifkan dan `expiresAt = activationTime + 30 hari`
    - **Validates: Requirements 4.5, 4.7**
    - **Property 7: Subscription Renewal Extends from Previous Expiry** — untuk Subscriber aktif yang memperbarui sebelum kedaluwarsa, `newExpiresAt = oldExpiresAt + 30 hari` (bukan dari tanggal bayar)
    - **Validates: Requirements 6.4**
    - **Property 16: No Raw Card Data Stored** — untuk setiap transaksi yang diproses, record di database tidak mengandung nomor kartu mentah, CVV, atau data kartu lengkap
    - **Validates: Requirements 8.6**

  - [~] 9.5 Buat halaman UI Checkout dan Subscription
    - Buat `src/app/(dashboard)/subscription/page.tsx` menampilkan: status langganan, tanggal mulai, tanggal kedaluwarsa, sisa hari, riwayat pembayaran, tombol "Perpanjang Langganan"
    - Buat halaman checkout dengan detail paket "Unlimited Plan – Rp29.000/bulan", pilihan metode pembayaran (Midtrans lokal / Stripe internasional)
    - Integrasi Midtrans Snap.js di client untuk membuka halaman pembayaran
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.5_

- [~] 10. Checkpoint — Pastikan semua test payment dan subscription lulus
  - Pastikan semua test lulus, tanyakan kepada user jika ada pertanyaan.

- [ ] 11. Implementasi Dashboard Pengguna
  - [~] 11.1 Buat Server Components dan data fetching untuk Dashboard
    - Buat `src/app/(dashboard)/dashboard/page.tsx` sebagai React Server Component
    - Fetch data: statistik total konten (sepanjang waktu), konten bulan ini, status akun, kuota harian (untuk Free_User), sisa hari langganan (untuk Subscriber), riwayat konten (diurutkan `createdAt DESC`), profil pengguna
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 6.2_

  - [~] 11.2 Buat komponen UI Dashboard
    - Buat komponen statistik: total konten, konten bulan ini, status akun
    - Buat komponen progress bar kuota harian (hanya untuk Free_User)
    - Buat komponen daftar riwayat konten dengan informasi: nama produk, jenis konten, marketplace target, tanggal generate
    - Implementasi klik item riwayat → tampilkan detail lengkap dalam modal
    - Implementasi tombol "Hapus" pada item riwayat dengan konfirmasi sebelum menghapus (soft delete: set `isDeleted = true`)
    - Tampilkan banner promosi "Upgrade Sekarang" hanya untuk Free_User (Subscriber tidak melihat banner ini)
    - Tambahkan tombol "Generate Konten Baru" yang mengarahkan ke `/generate`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [~] 11.3 Tulis property test untuk Content History
    - **Property 15: Content History Sorted by Recency** — untuk user dengan beberapa record riwayat, query selalu mengembalikan record diurutkan descending berdasarkan `createdAt`, terlepas dari urutan pembuatan
    - **Validates: Requirements 5.3**

- [ ] 12. Implementasi keamanan tambahan
  - [~] 12.1 Implementasi CSRF protection dan input validation
    - Verifikasi bahwa NextAuth v5 dan Next.js Server Actions sudah menangani CSRF secara built-in
    - Buat utility `src/lib/sanitize.ts` dengan fungsi `sanitizeProductInput` untuk membersihkan input sebelum dikirim ke AI Service (strip karakter berbahaya, escape injection patterns)
    - Tambahkan validasi server-side di semua Server Actions (tidak hanya client-side)
    - _Requirements: 8.3, 8.5_

  - [~] 12.2 Implementasi rate limiting dan API key security
    - Verifikasi semua API key (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `MIDTRANS_SERVER_KEY`, `STRIPE_SECRET_KEY`) hanya diakses di server-side (tidak pernah di-expose ke client)
    - Tambahkan header keamanan di `next.config.js`: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
    - _Requirements: 8.2, 8.7_

- [ ] 13. Integrasi akhir dan wiring semua komponen
  - [~] 13.1 Wire semua komponen dan pastikan alur end-to-end berfungsi
    - Pastikan alur registrasi → verifikasi email → login → generate konten → kuota berkurang → riwayat tersimpan berfungsi
    - Pastikan alur upgrade: kuota habis → modal upgrade → checkout → webhook → subscription aktif → generate unlimited berfungsi
    - Pastikan alur perpanjangan langganan: klik perpanjang → checkout → webhook → `expiresAt` bertambah 30 hari dari expiry lama berfungsi
    - Pastikan alur kedaluwarsa: `checkAndExpireSubscriptions` cron → downgrade ke Free_User → kuota 5/hari diterapkan berfungsi
    - _Requirements: 1.4, 1.6, 3.1, 3.5, 4.5, 4.9, 6.4_

  - [~] 13.2 Tulis integration tests untuk alur utama
    - Test alur autentikasi: registrasi → verifikasi email → login → logout
    - Test alur generate konten: submit form → quota check → AI call (mock) → simpan history
    - Test alur pembayaran: buat transaksi → webhook (mock) → aktivasi subscription
    - Test quota reset: cron endpoint mereset semua Free_User quota ke 0
    - _Requirements: 1.2, 1.6, 2.10, 3.6, 4.5_

- [~] 14. Final Checkpoint — Pastikan semua test lulus
  - Pastikan semua test lulus, tanyakan kepada user jika ada pertanyaan.

## Notes

- Task yang ditandai `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan requirement spesifik untuk keterlacakan
- Checkpoint memastikan validasi inkremental di setiap fase
- Property tests menggunakan library **fast-check** dengan minimum 100 iterasi per properti
- Unit tests melengkapi property tests untuk edge case dan kondisi error spesifik
- Semua operasi quota menggunakan Prisma transaction untuk mencegah race condition
- API key AI dan payment hanya boleh ada di environment variable server-side

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "4.1", "5.1"] },
    { "id": 1, "tasks": ["2.2", "6.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "5.2", "6.2"] },
    { "id": 3, "tasks": ["7.1", "9.1"] },
    { "id": 4, "tasks": ["7.2", "7.3", "9.2", "9.3"] },
    { "id": 5, "tasks": ["9.4", "9.5", "11.1"] },
    { "id": 6, "tasks": ["11.2", "12.1"] },
    { "id": 7, "tasks": ["11.3", "12.2"] },
    { "id": 8, "tasks": ["13.1"] },
    { "id": 9, "tasks": ["13.2"] }
  ]
}
```
