import { NextResponse } from 'next/server';

function resolveRuntimeVersion(): string {
  return (
    process.env.NEXT_PUBLIC_RUNTIME_VERSION?.trim() ||
    process.env.DEPLOY_ID?.trim() ||
    process.env.COMMIT_REF?.trim() ||
    process.env.DEPLOY_URL?.trim() ||
    process.env.URL?.trim() ||
    'dev'
  );
}

export async function GET() {
  const response = NextResponse.json({
    version: resolveRuntimeVersion(),
  });
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}
