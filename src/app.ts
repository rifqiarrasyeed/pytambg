import Fastify from "fastify";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import { config } from "./config";
import { registerErrorHandler } from "./plugins/error-handler";
import { authPlugin } from "./plugins/auth";
import { authRoutes } from "./modules/auth/routes";
import { meRoutes } from "./modules/me/routes";
import { sppgRoutes } from "./modules/sppg/routes";
import { masterRoutes } from "./modules/master/routes";
import { planningRoutes } from "./modules/planning/routes";
import { procurementRoutes } from "./modules/procurement/routes";
import { inventoryRoutes } from "./modules/inventory/routes";
import { productionRoutes } from "./modules/production/routes";
import { deliveryRoutes } from "./modules/delivery/routes";
import { reportRoutes } from "./modules/reports/routes";
import { auditRoutes } from "./modules/audit/routes";
import { attachmentRoutes } from "./modules/attachments/routes";
import { incidentRoutes } from "./modules/incidents/routes";
import { periodLockRoutes } from "./modules/period-locks/routes";
import { qaRoutes } from "./modules/qa/routes";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: "info"
    }
  });

  const allowedOrigins = new Set(config.corsAllowedOrigins);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true
  });
  await app.register(sensible);
  await app.register(authPlugin);
  await registerErrorHandler(app);

  app.addHook("preValidation", async (request) => {
    const routeUrl = request.routeOptions.url ?? request.url;
    const allowBodySppgId = routeUrl === "/me/active-sppg";
    if (request.body && typeof request.body === "object" && !Array.isArray(request.body)) {
      const body = request.body as Record<string, unknown>;
      // Tenant scope wajib berasal dari context auth, bukan request body.
      if (!allowBodySppgId && "sppg_id" in body) {
        delete body.sppg_id;
      }
    }
  });

  app.get("/health", async () => ({ ok: true, service: "mbg-ops-api", timestamp: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(sppgRoutes);
  await app.register(masterRoutes);
  await app.register(planningRoutes);
  await app.register(procurementRoutes);
  await app.register(inventoryRoutes);
  await app.register(productionRoutes);
  await app.register(deliveryRoutes);
  await app.register(reportRoutes);
  await app.register(auditRoutes);
  await app.register(attachmentRoutes);
  await app.register(periodLockRoutes);
  await app.register(incidentRoutes);
  await app.register(qaRoutes);

  return app;
}
