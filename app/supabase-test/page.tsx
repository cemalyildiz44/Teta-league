import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

// Force dynamic rendering so every visit hits the DB live (no static cache)
export const dynamic = "force-dynamic";

interface ConnectionTestRow {
  id: number;
  message: string;
  created_at: string;
}

export default async function SupabaseTestPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("connection_test")
    .select("id, message, created_at")
    .order("id", { ascending: true })
    .limit(5);

  // PostgreSQL error code 42P01 = relation does not exist (table missing, connection OK)
  // PostgreSQL error code 42501 = insufficient_privilege (connection OK, anon has no SELECT grant / RLS blocks)
  const tableNotFound    = error?.code === "42P01";
  const permissionDenied = error?.code === "42501";
  const connectionFailed = error !== null && !tableNotFound && !permissionDenied;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="bg-white rounded-xl shadow-md w-full max-w-lg p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Supabase Bağlantı Testi
        </h1>

        {/* ── SUCCESS ── */}
        {!error && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <span className="text-xl">✅</span>
              <span className="font-semibold">Bağlantı başarılı!</span>
            </div>

            <p className="text-sm text-gray-500">
              Supabase veritabanına ulaşıldı ve{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">
                connection_test
              </code>{" "}
              tablosundan{" "}
              <strong>{(data as ConnectionTestRow[]).length}</strong> kayıt
              okundu.
            </p>

            <table className="w-full text-sm border-collapse border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="border border-gray-200 px-3 py-2 text-left">ID</th>
                  <th className="border border-gray-200 px-3 py-2 text-left">Mesaj</th>
                  <th className="border border-gray-200 px-3 py-2 text-left">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {(data as ConnectionTestRow[]).map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="border border-gray-200 px-3 py-2">{row.id}</td>
                    <td className="border border-gray-200 px-3 py-2">{row.message}</td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-500">
                      {new Date(row.created_at).toLocaleString("tr-TR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── TABLE NOT FOUND (connection OK, table missing) ── */}
        {tableNotFound && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <span className="text-xl">⚠️</span>
              <span className="font-semibold">
                Bağlantı çalışıyor — tablo bulunamadı
              </span>
            </div>
            <p className="text-sm text-gray-600">
              Supabase'e başarıyla ulaşıldı ancak{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">
                connection_test
              </code>{" "}
              tablosu henüz oluşturulmamış.
            </p>
            <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono space-y-1">
              <p className="text-gray-400">-- Supabase SQL Editor&apos;da çalıştır:</p>
              <p>
                <span className="text-blue-400">CREATE TABLE</span>{" "}
                <span className="text-green-400">connection_test</span> (
              </p>
              <p className="pl-4">
                <span className="text-purple-400">id</span>{" "}
                <span className="text-yellow-400">serial</span>{" "}
                <span className="text-blue-400">PRIMARY KEY</span>,
              </p>
              <p className="pl-4">
                <span className="text-purple-400">message</span>{" "}
                <span className="text-yellow-400">text</span>{" "}
                <span className="text-blue-400">NOT NULL</span>,
              </p>
              <p className="pl-4">
                <span className="text-purple-400">created_at</span>{" "}
                <span className="text-yellow-400">timestamptz</span>{" "}
                <span className="text-blue-400">DEFAULT</span> now()
              </p>
              <p>);</p>
              <p className="mt-2">
                <span className="text-blue-400">INSERT INTO</span>{" "}
                <span className="text-green-400">connection_test</span>{" "}
                (message){" "}
                <span className="text-blue-400">VALUES</span> (
                <span className="text-orange-400">
                  &apos;Teta League bağlantısı başarılı!&apos;
                </span>
                );
              </p>
            </div>
            <p className="text-xs text-gray-400">
              PostgreSQL hata kodu:{" "}
              <code className="bg-gray-100 px-1 rounded">{error?.code}</code>
            </p>
          </div>
        )}

        {/* ── PERMISSION DENIED (42501) — connection OK, anon role missing GRANT / RLS blocks ── */}
        {permissionDenied && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <span className="text-xl">⚠️</span>
              <span className="font-semibold">
                Bağlantı çalışıyor — izin hatası (42501)
              </span>
            </div>
            <p className="text-sm text-gray-600">
              Supabase&apos;e başarıyla ulaşıldı ancak{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">anon</code>{" "}
              rolünün{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">
                connection_test
              </code>{" "}
              tablosunu okuma izni yok.
              <br />
              <span className="text-xs text-gray-400 mt-1 block">
                Neden: RLS politikası yok ve/veya{" "}
                <code className="bg-gray-100 px-1 rounded">
                  GRANT SELECT
                </code>{" "}
                verilmemiş.
              </span>
            </p>
            <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono leading-relaxed">
              <p className="text-gray-400 mb-2">
                -- Supabase SQL Editor&apos;da çalıştır (bir kez yeterli):
              </p>
              <p className="text-gray-400">-- 1. anon rolüne SELECT izni ver</p>
              <p>
                <span className="text-blue-400">GRANT SELECT ON</span>{" "}
                <span className="text-green-400">connection_test</span>{" "}
                <span className="text-blue-400">TO</span>{" "}
                <span className="text-yellow-400">anon</span>;
              </p>
              <p className="mt-3 text-gray-400">
                -- 2. RLS&apos;i etkinleştir (Supabase önerisi)
              </p>
              <p>
                <span className="text-blue-400">ALTER TABLE</span>{" "}
                <span className="text-green-400">connection_test</span>{" "}
                <span className="text-blue-400">ENABLE ROW LEVEL SECURITY</span>;
              </p>
              <p className="mt-3 text-gray-400">
                -- 3. Herkese (anon dahil) SELECT izni veren policy
              </p>
              <p>
                <span className="text-blue-400">CREATE POLICY</span>{" "}
                <span className="text-orange-400">
                  &quot;public_read_connection_test&quot;
                </span>{" "}
                <span className="text-blue-400">ON</span>{" "}
                <span className="text-green-400">connection_test</span>
              </p>
              <p className="pl-4">
                <span className="text-blue-400">FOR SELECT TO</span>{" "}
                <span className="text-yellow-400">anon</span>
              </p>
              <p className="pl-4">
                <span className="text-blue-400">USING</span> (
                <span className="text-purple-400">true</span>);
              </p>
            </div>
            <p className="text-xs text-gray-400">
              PostgreSQL hata kodu:{" "}
              <code className="bg-gray-100 px-1 rounded">{error?.code}</code>{" "}
              · {error?.message}
            </p>
          </div>
        )}

        {/* ── REAL CONNECTION FAILURE ── */}
        {connectionFailed && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <span className="text-xl">❌</span>
              <span className="font-semibold">Bağlantı başarısız</span>
            </div>
            <p className="text-sm text-gray-600">
              Supabase&apos;e ulaşılamadı. Ortam değişkenlerini ve Supabase
              proje ayarlarını kontrol edin.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs font-mono text-red-800 space-y-1">
              <p>
                <strong>Hata:</strong> {error?.message}
              </p>
              {error?.code && (
                <p>
                  <strong>Kod:</strong> {error.code}
                </p>
              )}
            </div>
          </div>
        )}

        <hr className="border-gray-100" />
        <p className="text-xs text-gray-400">
          Bu sayfa yalnızca geliştirme aşamasında bağlantı testi içindir.
          Daha sonra silinecektir.
        </p>
      </div>
    </main>
  );
}
