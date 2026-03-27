import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No code received' }, { status: 400 });
  }

  // Display the code so user can copy it
  return new NextResponse(
    `<html>
<body style="font-family:system-ui;padding:40px;max-width:600px;margin:0 auto">
<h1>✅ Google Auth Code Received!</h1>
<p>Copy this code and paste it in the terminal:</p>
<pre style="background:#f1f5f9;padding:16px;border-radius:8px;word-break:break-all;font-size:14px">${code}</pre>
<p style="color:#666;margin-top:20px">This page can be closed after copying the code.</p>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
