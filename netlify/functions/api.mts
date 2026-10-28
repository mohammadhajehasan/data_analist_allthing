import serverless from 'serverless-http';
import type { Handler } from '@netlify/functions';

// Run the existing Express app (server.ts) as a Netlify Function. The flag
// must be set before the module loads so it skips app.listen() and timers.
process.env.SERVERLESS_RUNTIME = 'netlify';

let cached: ((...args: Parameters<Handler>) => Promise<any>) | null = null;

export const handler: Handler = async (event, context) => {
  if (!cached) {
    const { default: app } = await import('../../server');
    cached = serverless(app, {
      binary: ['application/octet-stream', 'application/pdf', 'image/*'],
      // Direct calls arrive as /.netlify/functions/api/...; Express expects /api/...
      request(req: { url?: string }) {
        if (req.url?.startsWith('/.netlify/functions/api')) {
          req.url = '/api' + req.url.slice('/.netlify/functions/api'.length);
        }
      },
    });
  }
  return cached!(event, context);
};
