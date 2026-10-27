import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Local dev: serve /api/* with the same handlers Vercel runs in production. */
function apiDev(): Plugin {
  return {
    name: 'paperpal-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z]+)/);
        if (!m) return next();
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const raw = Buffer.concat(chunks).toString('utf8');
        const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
        const vreq = Object.assign(req, { body: raw ? JSON.parse(raw) : {} });
        const vres = Object.assign(res, {
          status(code: number) {
            res.statusCode = code;
            return vres;
          },
          json(obj: unknown) {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(obj));
            return vres;
          },
        });
        await mod.default(vreq, vres);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [apiDev()],
    server: { host: '0.0.0.0', port: 5173 },
    build: { target: 'es2022' },
  };
});
