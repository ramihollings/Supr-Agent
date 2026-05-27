import { NextResponse } from 'next/server';
import dns from 'dns';

async function isSafeUrl(targetUrl: string): Promise<boolean> {
  try {
    const parsedUrl = new URL(targetUrl);
    const hostname = parsedUrl.hostname;

    // Block obvious loopback, localhost, and broadcast
    const directBlock = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    if (directBlock.includes(hostname.toLowerCase())) {
      return false;
    }

    // Direct check for local IP subnets to save DNS lookup time
    if (
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    // Resolve domain to IP and check
    const ip = await new Promise<string>((resolve, reject) => {
      dns.lookup(hostname, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    }).catch(() => null);

    if (!ip) {
      return false;
    }

    // Subnet checks on resolved IP
    if (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '0.0.0.0' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('URL parameter is required', { status: 400 });
  }

  try {
    // Basic normalization of the URL
    let normalizedUrl = targetUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // SSRF Validation
    const safe = await isSafeUrl(normalizedUrl);
    if (!safe) {
      return new NextResponse('Access to private or local network resources is forbidden (SSRF Protection)', { status: 403 });
    }

    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return new NextResponse(`Failed to fetch target URL: ${response.statusText}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || '';
    
    // If it's HTML, we rewrite URLs so links and assets load correctly.
    if (contentType.includes('text/html')) {
      let html = await response.text();
      const parsedUrl = new URL(normalizedUrl);
      const origin = parsedUrl.origin;

      // 1. Rewrite relative links, stylesheets, scripts, images to absolute
      html = html.replace(/(src|href)=["'](?!https?:\/\/|\/\/|data:|javascript:|#)([^"']+)["']/gi, (match, attr, path) => {
        let absolutePath = '';
        if (path.startsWith('/')) {
          absolutePath = `${origin}${path}`;
        } else {
          // Resolve relative path
          const currentPath = parsedUrl.pathname;
          const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
          absolutePath = `${origin}${basePath}${path}`;
        }
        return `${attr}="${absolutePath}"`;
      });

      // 2. Rewrite protocol-relative links (e.g. //cdn.com -> https://cdn.com)
      html = html.replace(/(src|href)=["']\/\/([^"']+)["']/gi, (match, attr, domain) => {
        return `${attr}="https://${domain}"`;
      });

      // 3. Rewrite anchor tags so clicking links stays in the proxy
      html = html.replace(/<a\s+([^>]*?)href=["'](https?:\/\/[^"']+)["']/gi, (match, attrs, link) => {
        if (link.includes('/api/proxy')) {
          return match;
        }
        return `<a ${attrs}href="/api/proxy?url=${encodeURIComponent(link)}"`;
      });

      // 4. Inject a script to prevent iframe escaping and block top-level redirections
      const injectedCode = `
        <style>
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          ::-webkit-scrollbar-track {
            background: #f1f1f1;
          }
          ::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
        </style>
        <script>
          // Prevent iframe escaping / frame-busting
          window.onbeforeunload = function() {
            // Cancel navigation outside iframe
          };
          
          // Intercept forms to submit through the proxy
          document.addEventListener('submit', function(e) {
            const form = e.target;
            if (form && form.action) {
              e.preventDefault();
              const actionUrl = new URL(form.action, window.location.href).href;
              const method = (form.method || 'GET').toUpperCase();
              
              if (method === 'GET') {
                const formData = new FormData(form);
                const params = new URLSearchParams();
                for (const [key, value] of formData.entries()) {
                  params.append(key, value.toString());
                }
                const separator = actionUrl.includes('?') ? '&' : '?';
                const fullUrl = actionUrl + separator + params.toString();
                window.location.href = '/api/proxy?url=' + encodeURIComponent(fullUrl);
              }
            }
          });
        </script>
      `;

      if (html.includes('</head>')) {
        html = html.replace('</head>', `${injectedCode}</head>`);
      } else {
        html = html + injectedCode;
      }

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    // For images, stylesheets, or other static assets, return them directly
    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
      },
    });

  } catch (error: any) {
    return new NextResponse(`Proxy error: ${error.message}`, { status: 500 });
  }
}
