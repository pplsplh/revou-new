# Requirements Document

## Introduction

AI Content Generator SaaS adalah platform berbasis web yang membantu seller marketplace Indonesia (Tokopedia, Shopee, Lazada, dll) membuat konten produk secara otomatis menggunakan kecerdasan buatan. Platform ini menyediakan fitur pembuatan caption produk, deskripsi produk, dan judul listing yang dioptimalkan untuk algoritma marketplace Indonesia. Sistem menggunakan model bisnis freemium dengan batas 5 generate per hari untuk pengguna gratis, dan akses unlimited melalui langganan berbayar Rp29.000/bulan.

## Glossary

- **System**: Platform SaaS AI Content Generator secara keseluruhan
- **User**: Pengguna terdaftar yang menggunakan platform
- **Free_User**: Pengguna dengan akun gratis yang memiliki kuota 5 generate per hari
- **Subscriber**: Pengguna yang memiliki langganan aktif berbayar
- **Auth_Service**: Layanan autentikasi berbasis NextAuth yang mengelola sesi dan identitas pengguna
- **AI_Service**: Layanan orkestrasi yang mengelola permintaan ke Claude API dan Gemini API
- **Content_Generator**: Modul yang memproses input produk dan menghasilkan konten marketplace
- **Quota_Manager**: Modul yang melacak dan menegakkan batas penggunaan harian per pengguna
- **Payment_Service**: Layanan yang mengelola transaksi melalui Midtrans dan Stripe
- **Subscription_Manager**: Modul yang mengelola status langganan dan masa berlaku
- **Dashboard**: Antarmuka pengguna utama yang menampilkan riwayat, statistik, dan akses ke fitur
- **Marketplace**: Platform e-commerce Indonesia seperti Tokopedia, Shopee, Lazada, Bukalapak
- **Listing**: Halaman produk di marketplace yang memerlukan judul, deskripsi, dan caption
- **Caption**: Teks pendek promosi produk untuk media sosial atau halaman produk marketplace
- **Daily_Quota**: Batas jumlah generate konten per hari untuk Free_User (5 generate)
- **Midtrans**: Payment gateway utama untuk pasar Indonesia
- **Stripe**: Payment gateway sekunder untuk transaksi internasional

---

## Requirements

### Requirement 1: Registrasi dan Login Pengguna

**User Story:** Sebagai calon pengguna, saya ingin mendaftar dan masuk ke platform menggunakan email atau akun Google, agar saya dapat mengakses fitur pembuatan konten AI.

#### Acceptance Criteria

1. THE Auth_Service SHALL menyediakan formulir registrasi dengan field email, password, dan nama lengkap.
2. WHEN pengguna mengirimkan formulir registrasi dengan email yang valid dan password minimal 8 karakter, THE Auth_Service SHALL membuat akun baru dan mencoba mengirimkan email verifikasi; jika layanan email tidak tersedia, THE Auth_Service SHALL tetap menyelesaikan registrasi dan menyediakan opsi bagi pengguna untuk meminta ulang email verifikasi.
3. IF pengguna mengirimkan formulir registrasi dengan email yang sudah terdaftar, THEN THE Auth_Service SHALL menampilkan pesan error "Email sudah terdaftar. Silakan gunakan email lain atau masuk."
4. WHEN pengguna mengklik tautan verifikasi email yang valid, THE Auth_Service SHALL mengaktifkan akun dan mengarahkan pengguna ke Dashboard.
5. THE Auth_Service SHALL menyediakan opsi login menggunakan akun Google melalui OAuth 2.0.
6. WHEN pengguna berhasil login dengan email/password atau Google OAuth, THE Auth_Service SHALL membuat sesi yang berlaku selama 30 hari dan mengarahkan pengguna ke Dashboard.
7. IF pengguna memasukkan email atau password yang salah saat login, THEN THE Auth_Service SHALL menampilkan pesan error "Email atau password salah" tanpa mengungkapkan field mana yang salah.
8. WHEN pengguna mengklik "Lupa Password", THE Auth_Service SHALL mengirimkan email reset password yang berlaku selama 1 jam.
9. IF tautan reset password sudah kedaluwarsa, THEN THE Auth_Service SHALL menampilkan pesan error dan menawarkan pengiriman ulang tautan.
10. WHEN pengguna logout, THE Auth_Service SHALL menghapus sesi aktif dan mengarahkan pengguna ke halaman login.

---

### Requirement 2: Pembuatan Konten Produk dengan AI

**User Story:** Sebagai seller marketplace, saya ingin memasukkan informasi produk dan mendapatkan konten yang dioptimalkan secara otomatis, agar saya dapat membuat listing produk yang menarik dengan cepat.

#### Acceptance Criteria

1. THE Content_Generator SHALL menyediakan formulir input dengan field: nama produk (wajib), kategori produk (wajib), fitur utama produk (wajib, minimal 3 poin), harga produk (opsional), target marketplace (wajib: Tokopedia/Shopee/Lazada/Bukalapak/Semua), dan tone konten (formal/santai/promosi).
2. WHEN pengguna mengirimkan formulir input yang valid, THE Content_Generator SHALL menghasilkan tiga jenis konten: judul listing (maksimal 70 karakter), deskripsi produk (300–500 kata), dan caption media sosial (maksimal 280 karakter).
3. THE AI_Service SHALL menggunakan Claude API sebagai provider utama untuk setiap permintaan generate konten.
4. IF Claude API tidak merespons dalam 10 detik atau mengembalikan error, THEN THE AI_Service SHALL secara otomatis beralih ke Gemini API sebagai fallback tanpa interupsi pada pengalaman pengguna.
5. WHEN konten berhasil dihasilkan, THE Content_Generator SHALL menampilkan hasil dalam tiga tab terpisah: "Judul Listing", "Deskripsi Produk", dan "Caption".
6. THE Content_Generator SHALL menghasilkan konten dalam Bahasa Indonesia dengan konteks lokal yang relevan untuk marketplace Indonesia.
7. WHEN pengguna mengklik tombol "Salin" pada salah satu hasil konten, THE Content_Generator SHALL menyalin teks ke clipboard dan menampilkan konfirmasi "Berhasil disalin!".
8. WHEN pengguna mengklik tombol "Generate Ulang" pada salah satu jenis konten, THE Content_Generator SHALL menghasilkan variasi baru untuk jenis konten tersebut saja tanpa mengubah jenis konten lainnya.
9. WHEN pengguna mengklik tombol submit dengan field wajib yang kosong, THE Content_Generator SHALL menampilkan pesan validasi pada setiap field yang kosong dan mencegah pengiriman formulir.
10. WHEN konten berhasil dihasilkan, THE Content_Generator SHALL menyimpan hasil ke riwayat pengguna secara otomatis.

---

### Requirement 3: Manajemen Kuota Harian (Freemium)

**User Story:** Sebagai Free_User, saya ingin mengetahui sisa kuota generate harian saya, agar saya dapat merencanakan penggunaan atau memutuskan untuk berlangganan.

#### Acceptance Criteria

1. THE Quota_Manager SHALL memberikan setiap Free_User kuota 5 generate konten per hari kalender (reset pukul 00:00 WIB).
2. WHILE pengguna adalah Free_User, THE Quota_Manager SHALL menampilkan indikator kuota yang menunjukkan jumlah generate yang tersisa hari ini di Dashboard dan halaman generate.
3. WHEN Free_User berhasil melakukan generate konten, THE Quota_Manager SHALL mengurangi kuota harian sebesar 1 dan memperbarui tampilan indikator secara real-time.
4. IF Free_User mencoba melakukan generate konten saat kuota harian sudah habis (0 tersisa), THEN THE Quota_Manager SHALL memblokir permintaan dan menampilkan modal upgrade yang menjelaskan manfaat berlangganan; modal upgrade hanya ditampilkan ketika kuota benar-benar habis dan pengguna mencoba melakukan generate.
5. WHILE pengguna adalah Subscriber dengan langganan aktif, THE Quota_Manager SHALL mengizinkan generate konten tanpa batas harian.
6. THE Quota_Manager SHALL mereset kuota harian semua Free_User pada pukul 00:00 WIB setiap hari.
7. WHEN Free_User memiliki sisa kuota 1, THE Quota_Manager SHALL menampilkan peringatan "Sisa 1 generate hari ini. Upgrade untuk akses unlimited."

---

### Requirement 4: Pembayaran dan Aktivasi Langganan

**User Story:** Sebagai Free_User, saya ingin berlangganan dengan mudah menggunakan metode pembayaran lokal Indonesia, agar saya dapat mengakses generate konten tanpa batas.

#### Acceptance Criteria

1. THE Payment_Service SHALL menyediakan halaman checkout dengan detail paket: "Unlimited Plan – Rp29.000/bulan".
2. THE Payment_Service SHALL mendukung metode pembayaran melalui Midtrans: transfer bank (BCA, Mandiri, BNI, BRI), dompet digital (GoPay, OVO, Dana), QRIS, dan kartu kredit/debit.
3. WHERE pengguna memilih pembayaran internasional, THE Payment_Service SHALL menyediakan opsi pembayaran melalui Stripe dengan kartu kredit/debit internasional; pengguna tetap dapat memilih Midtrans dengan metode lokal meskipun memilih opsi internasional.
4. WHEN pengguna memilih metode pembayaran dan mengkonfirmasi checkout, THE Payment_Service SHALL membuat transaksi di Midtrans atau Stripe dan menampilkan instruksi pembayaran atau redirect ke halaman pembayaran.
5. WHEN Midtrans atau Stripe mengirimkan notifikasi webhook konfirmasi pembayaran berhasil, THE Payment_Service SHALL mengaktifkan status Subscriber pada akun pengguna dalam waktu maksimal 60 detik.
6. IF pembayaran gagal atau kedaluwarsa, THEN THE Payment_Service SHALL memperbarui status transaksi menjadi gagal dan mengirimkan notifikasi email kepada pengguna; notifikasi hanya dikirimkan ketika pembayaran benar-benar gagal atau kedaluwarsa, bukan saat proses pembayaran masih berlangsung.
7. WHEN langganan diaktifkan, THE Subscription_Manager SHALL menetapkan tanggal kedaluwarsa 30 hari dari tanggal aktivasi dan mengirimkan email konfirmasi kepada pengguna.
8. WHEN langganan akan kedaluwarsa dalam 3 hari, THE Subscription_Manager SHALL mengirimkan email pengingat perpanjangan kepada pengguna.
9. IF langganan kedaluwarsa dan tidak diperpanjang, THEN THE Subscription_Manager SHALL menurunkan status pengguna kembali ke Free_User dan menerapkan kuota harian 5 generate.
10. THE Payment_Service SHALL menyimpan riwayat transaksi yang dapat diakses pengguna di Dashboard, menampilkan tanggal, jumlah, metode pembayaran, dan status transaksi.

---

### Requirement 5: Dashboard Pengguna

**User Story:** Sebagai pengguna, saya ingin melihat ringkasan penggunaan dan riwayat konten yang saya buat, agar saya dapat mengelola aktivitas saya di platform.

#### Acceptance Criteria

1. THE Dashboard SHALL menampilkan ringkasan statistik pengguna: total konten yang dihasilkan (sepanjang waktu), konten yang dihasilkan bulan ini, dan status akun (Free/Subscriber).
2. WHILE pengguna adalah Free_User, THE Dashboard SHALL menampilkan progress bar kuota harian yang menunjukkan jumlah generate yang telah digunakan dari total 5 per hari.
3. THE Dashboard SHALL menampilkan daftar riwayat konten yang dihasilkan, diurutkan dari yang terbaru, dengan informasi: nama produk, jenis konten, marketplace target, dan tanggal generate.
4. WHEN pengguna mengklik item riwayat konten, THE Dashboard SHALL menampilkan detail lengkap konten yang dihasilkan dalam modal atau halaman terpisah.
5. THE Dashboard SHALL menyediakan tombol "Generate Konten Baru" yang mengarahkan pengguna ke halaman Content_Generator.
6. WHILE pengguna adalah Free_User, THE Dashboard SHALL menampilkan banner promosi langganan dengan tombol "Upgrade Sekarang"; Subscriber tidak akan melihat konten terkait upgrade di Dashboard mereka.
7. THE Dashboard SHALL menampilkan informasi profil pengguna: nama, email, dan tanggal bergabung.
8. WHEN pengguna mengklik "Hapus" pada item riwayat, THE Dashboard SHALL menampilkan konfirmasi penghapusan dan menghapus item setelah dikonfirmasi.

---

### Requirement 6: Manajemen Langganan

**User Story:** Sebagai Subscriber, saya ingin melihat dan mengelola status langganan saya, agar saya dapat memantau masa berlaku dan melakukan perpanjangan.

#### Acceptance Criteria

1. THE Subscription_Manager SHALL menampilkan halaman detail langganan yang berisi: status langganan (Aktif/Tidak Aktif), tanggal mulai, tanggal kedaluwarsa, dan riwayat pembayaran.
2. WHILE langganan aktif, THE Subscription_Manager SHALL menampilkan sisa hari langganan di halaman detail langganan dan Dashboard.
3. WHEN Subscriber mengklik "Perpanjang Langganan", THE Subscription_Manager SHALL mengarahkan pengguna ke halaman checkout dengan paket yang sama.
4. WHEN Subscriber berhasil melakukan perpanjangan sebelum kedaluwarsa, THE Subscription_Manager SHALL menambahkan 30 hari dari tanggal kedaluwarsa yang ada (bukan dari tanggal pembayaran); jika perpanjangan gagal karena masalah pembayaran atau teknis, THE Subscription_Manager SHALL mengizinkan Subscriber untuk mencoba kembali tanpa pembatasan tambahan.
5. IF Subscriber mencoba mengakses fitur generate konten saat langganan sudah kedaluwarsa, THEN THE Subscription_Manager SHALL menampilkan notifikasi bahwa langganan telah berakhir dan menawarkan opsi perpanjangan.

---

### Requirement 7: Optimasi Konten untuk Marketplace Spesifik

**User Story:** Sebagai seller, saya ingin konten yang dihasilkan disesuaikan dengan aturan dan karakteristik marketplace yang saya pilih, agar listing saya lebih optimal di platform tersebut.

#### Acceptance Criteria

1. WHEN pengguna memilih Tokopedia sebagai target marketplace, THE Content_Generator SHALL menghasilkan judul listing yang mengikuti format Tokopedia: mengandung nama produk, merek (jika ada), dan spesifikasi utama, dengan panjang 40–70 karakter.
2. WHEN pengguna memilih Shopee sebagai target marketplace, THE Content_Generator SHALL menghasilkan judul listing yang mengikuti format Shopee: mengandung kata kunci utama di awal judul, dengan panjang 25–120 karakter.
3. WHEN pengguna memilih "Semua Marketplace", THE Content_Generator SHALL menghasilkan satu set konten yang dioptimalkan secara umum dan dapat digunakan di berbagai marketplace.
4. THE Content_Generator SHALL menyertakan kata kunci yang relevan dengan kategori produk dan konteks belanja online Indonesia dalam setiap konten yang dihasilkan.
5. WHEN pengguna memilih tone "Santai", THE Content_Generator SHALL menggunakan bahasa informal dan emoji yang umum digunakan di marketplace Indonesia.
6. WHEN pengguna memilih tone "Formal", THE Content_Generator SHALL menggunakan bahasa formal tanpa emoji, sesuai untuk produk profesional atau B2B.
7. WHEN pengguna memilih tone "Promosi", THE Content_Generator SHALL menggunakan bahasa persuasif dengan penekanan pada keunggulan produk, diskon, dan call-to-action yang umum di marketplace Indonesia.

---

### Requirement 8: Keamanan dan Perlindungan Data

**User Story:** Sebagai pengguna, saya ingin data pribadi dan konten saya terlindungi, agar saya dapat menggunakan platform dengan aman.

#### Acceptance Criteria

1. THE Auth_Service SHALL menyimpan password pengguna menggunakan algoritma hashing bcrypt dengan salt rounds minimal 12.
2. THE System SHALL menggunakan HTTPS untuk semua komunikasi antara browser pengguna dan server.
3. THE Auth_Service SHALL mengimplementasikan proteksi CSRF pada semua endpoint yang memerlukan autentikasi.
4. IF pengguna gagal login sebanyak 5 kali berturut-turut dalam 15 menit, THEN THE Auth_Service SHALL mengunci akun sementara selama 15 menit dan mengirimkan notifikasi email kepada pemilik akun; notifikasi hanya dikirimkan ketika akun benar-benar dikunci.
5. THE System SHALL memvalidasi dan membersihkan semua input pengguna sebelum dikirimkan ke AI_Service untuk mencegah prompt injection.
6. THE Payment_Service SHALL tidak menyimpan data kartu kredit pengguna secara langsung, melainkan menggunakan token yang disediakan oleh Midtrans atau Stripe.
7. THE System SHALL menyimpan API key Claude dan Gemini hanya di environment variable server-side dan tidak pernah mengeksposnya ke client-side.
