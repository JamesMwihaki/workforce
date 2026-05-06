import LoginForm from './LoginForm';

const ERROR_MESSAGES: Record<string, string> = {
  no_manager:
    "Your account doesn't have a manager profile yet. Ask the cluster admin to add you.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Manager login</h1>
        <p className="mt-1 text-sm text-gray-700">Sign in to manage shift requests.</p>
      </header>
      {errorMessage && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {errorMessage}
        </p>
      )}
      <LoginForm next={searchParams.next ?? '/dashboard'} />
    </main>
  );
}
