import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Get subjects
  const { data: subjects } = await supabase
    .from("subjects")
    .select("*")
    .order("display_order");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-emerald-600">مدرسة السودان</h1>
              <p className="text-sm text-gray-500">Madrassa Sudan</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-700">
                مرحباً، {profile?.full_name || "طالب"}
              </span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  تسجيل الخروج
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-l from-emerald-500 to-emerald-600 rounded-2xl p-6 mb-8 text-white">
          <h2 className="text-2xl font-bold mb-2">
            أهلاً وسهلاً، {profile?.full_name?.split(" ")[0] || "طالب"}! 👋
          </h2>
          <p className="opacity-90">استمر في رحلة التعلم الخاصة بك</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Link
            href="/lessons"
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-center"
          >
            <div className="text-3xl mb-2">📚</div>
            <div className="font-medium text-gray-900">الدروس</div>
            <div className="text-sm text-gray-500">Lessons</div>
          </Link>
          <Link
            href="/homework"
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-center"
          >
            <div className="text-3xl mb-2">📝</div>
            <div className="font-medium text-gray-900">الواجبات</div>
            <div className="text-sm text-gray-500">Homework</div>
          </Link>
          <Link
            href="/tutor"
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-center"
          >
            <div className="text-3xl mb-2">🤖</div>
            <div className="font-medium text-gray-900">المعلم الذكي</div>
            <div className="text-sm text-gray-500">AI Tutor</div>
          </Link>
          <Link
            href="/cohorts/join"
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-center"
          >
            <div className="text-3xl mb-2">👥</div>
            <div className="font-medium text-gray-900">الفصول</div>
            <div className="text-sm text-gray-500">Classes</div>
          </Link>
        </div>

        {/* Subjects Grid */}
        <section>
          <h3 className="text-xl font-bold text-gray-900 mb-4">المواد الدراسية</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {subjects?.map((subject) => (
              <Link
                key={subject.id}
                href={`/lessons?subject=${subject.id}`}
                className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-center"
              >
                <div className="text-4xl mb-3">{subject.icon}</div>
                <div className="font-medium text-gray-900">{subject.name_ar}</div>
                <div className="text-xs text-gray-500">{subject.name_en}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent Activity Placeholder */}
        <section className="mt-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">نشاطك الأخير</h3>
          <div className="bg-white rounded-xl p-8 shadow-sm text-center text-gray-500">
            <div className="text-4xl mb-2">🎯</div>
            <p>ابدأ رحلة التعلم الآن!</p>
            <p className="text-sm">اختر مادة من الأعلى للبدء</p>
          </div>
        </section>
      </main>
    </div>
  );
}
