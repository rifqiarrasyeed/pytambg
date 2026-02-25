import Fastify from "fastify";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
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

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: "info"
    }
  });

  await app.register(cors, {
    origin: true,
    credentials: true
  });
  await app.register(sensible);
  await app.register(authPlugin);

  app.addHook("preValidation", async (request) => {
    if (request.body && typeof request.body === "object" && !Array.isArray(request.body)) {
      const body = request.body as Record<string, unknown>;
      // Tenant scope wajib berasal dari context auth, bukan request body.
      if ("sppg_id" in body) {
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

  await registerErrorHandler(app);

  return app;
}
