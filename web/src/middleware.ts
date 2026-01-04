import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청에 대해 미들웨어를 실행합니다:
     * 1. /api/* (API 라우트)
     * 2. /_next/* (Next.js 내부 시스템 파일)
     * 3. /_static/* (정적 파일 폴더)
     * 4. /_vercel (Vercel 내부 요청)
     * 5. 확장자가 있는 파일들 (예: favicon.ico, images.png 등)
     */
    '/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)',
  ],
};

export default async function middleware(req: NextRequest) {
  // 요청된 URL과 호스트(도메인) 정보를 가져옵니다.
  const url = req.nextUrl;
  const hostname = req.headers.get('host') || '';

  // 테스트를 위한 허용 도메인 목록입니다.
  // 실제 운영 환경에서는 환경 변수 등을 통해 관리하는 것이 좋습니다.
  const allowedDomains = ['localhost:3000', 'lvh.me:3000', 'fiery-horizon.com'];

  // 현재 요청이 허용된 메인 도메인 중 하나에 포함되는지 확인합니다.
  const isAllowedDomain = allowedDomains.some(domain => hostname.includes(domain));

  // 서브도메인을 추출합니다.
  // 예: "preview.lvh.me:3000" -> "preview"
  // 예: "lvh.me:3000" -> null 또는 빈 문자열이 될 수 있으므로 처리 필요
  // 여기서는 :3000 포트를 제거하고 점(.)을 기준으로 나눕니다.
  const currentHost = hostname.replace(`:3000`, '');
  const subdomain = currentHost.split('.')[0];

  // 메인 도메인, www, localhost 등은 테넌트로 취급하지 않고 통과시킵니다.
  // 이들은 일반적인 랜딩 페이지나 메인 서비스 접속으로 간주합니다.
  if (subdomain === 'lvh' || subdomain === 'www' || subdomain === 'localhost' || subdomain === 'fiery-horizon') {
    return NextResponse.next();
  }

  // -----------------------------------------------------------------------------
  // [보안/유효성 검사] 유효한 테넌트인지 확인하는 단계입니다. (Method A)
  // -----------------------------------------------------------------------------
  // Dynamic Tenant Validation:
  // API Gateway를 통해 해당 서브도메인이 유효한지 확인합니다.
  try {
    // Note: In Next.js middleware, fetch requests to localhost might need absolute URL.
    // Assuming the Gateway is running on localhost:8080 for dev.
    // In production, this should be the internal service URL or handled via env vars.
    const validationUrl = 'http://localhost:8080/api/v1/tenants/validate?domain=' + subdomain;
    const res = await fetch(validationUrl);

    if (res.status === 404) {
      console.log(`[Middleware] Invalid tenant: ${subdomain}`);
      return new NextResponse('Tenant Not Found', { status: 404 });
    } else if (!res.ok) {
      // 500 etc. Gateway might be down or error.
      // Decide whether to block or allow. For safety, maybe log and allow, or block.
      // Here we'll log and allow to avoid blocking if gateway is temporarily restarting, 
      // but strictly speaking should block or show error page.
      console.error(`[Middleware] Tenant validation error: ${res.status}`);
    }
  } catch (error) {
    console.error(`[Middleware] Failed to validate tenant:`, error);
    // Fail safe: Allow or Block?
    // Block if we want strict enforcement.
    // return new NextResponse('Internal Server Error', { status: 500 });
  }

  console.log(`[Middleware] Accessing tenant subdomain: ${subdomain}`);

  // -----------------------------------------------------------------------------
  // [요청 재구성] 테넌트 정보를 포함하여 요청을 전달합니다.
  // -----------------------------------------------------------------------------
  // 방법 1: URL Rewrite (예: /dashboard -> /_sites/tenant-a/dashboard)
  // Next.js의 폴더 기반 라우팅을 활용해 각 테넌트별로 완전히 다른 페이지를 보여주고 싶을 때 유용합니다.
  // url.pathname = `/_sites/${subdomain}${url.pathname}`;
  // return NextResponse.rewrite(url);

  // 방법 2: Header Injection (현재 사용 중인 방식)
  // 동일한 UI/페이지 구조를 사용하되, 데이터만 분리하는 경우에 적합합니다.
  // 하위 컴포넌트(Server Components, API Handler)에서 'x-tenant-id' 헤더를 열어보고
  // "아, 이건 Wizvera 데이터만 보여줘야겠구나"라고 판단하게 됩니다.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-tenant-id', subdomain);

  console.log(`[Middleware] Tenant Context Injected: ${subdomain}`);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}
