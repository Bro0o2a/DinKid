export function SetupNotice() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="card max-w-md p-6 space-y-2">
        <h1 className="text-xl font-bold">Almost there 🔧</h1>
        <p>
          DinKin needs its Supabase keys. Copy <code>.env.example</code> to <code>.env.local</code>, fill in the two
          values, and restart. The README walks through it step by step.
        </p>
      </div>
    </main>
  );
}
