import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const platformAdminRole = await prisma.platformRole.upsert({
    where: { code: "PLATFORM_ADMIN" },
    update: { name: "Platform Admin" },
    create: { code: "PLATFORM_ADMIN", name: "Platform Admin" }
  });

  const platformOpsRole = await prisma.platformRole.upsert({
    where: { code: "PLATFORM_OPS" },
    update: { name: "Platform Ops" },
    create: { code: "PLATFORM_OPS", name: "Platform Ops" }
  });

  const tenantRoleCodes = [
    { code: "TENANT_OWNER", name: "Owner/Admin SPPG" },
    { code: "TENANT_OPERATOR", name: "Operator Produksi" },
    { code: "TENANT_DRIVER", name: "Driver" },
    { code: "TENANT_VIEWER", name: "Viewer" },
    { code: "SCHOOL_VERIFIER", name: "School Verifier" }
  ];

  for (const role of tenantRoleCodes) {
    await prisma.tenantRole.upsert({ where: { code: role.code }, update: { name: role.name }, create: role });
  }

  const adminPassword = await bcrypt.hash("Admin#12345", 10);

  const platformAdmin = await prisma.platformUser.upsert({
    where: { email: "platform.admin@mbg.local" },
    update: { name: "Platform Admin", passwordHash: adminPassword, isActive: true },
    create: {
      email: "platform.admin@mbg.local",
      name: "Platform Admin",
      passwordHash: adminPassword
    }
  });

  const platformOps = await prisma.platformUser.upsert({
    where: { email: "platform.ops@mbg.local" },
    update: { name: "Platform Ops", passwordHash: adminPassword, isActive: true },
    create: {
      email: "platform.ops@mbg.local",
      name: "Platform Ops",
      passwordHash: adminPassword
    }
  });

  await prisma.platformUserRole.upsert({
    where: { userId_roleId: { userId: platformAdmin.id, roleId: platformAdminRole.id } },
    update: {},
    create: { userId: platformAdmin.id, roleId: platformAdminRole.id }
  });

  await prisma.platformUserRole.upsert({
    where: { userId_roleId: { userId: platformOps.id, roleId: platformOpsRole.id } },
    update: {},
    create: { userId: platformOps.id, roleId: platformOpsRole.id }
  });

  const tenantOwner = await prisma.platformUser.upsert({
    where: { email: "admin@demo.local" },
    update: { name: "Tenant Owner Demo", passwordHash: adminPassword, isActive: true },
    create: {
      email: "admin@demo.local",
      name: "Tenant Owner Demo",
      passwordHash: adminPassword
    }
  });

  const driver = await prisma.platformUser.upsert({
    where: { email: "driver@demo.local" },
    update: { name: "Driver Demo", passwordHash: adminPassword, isActive: true },
    create: {
      email: "driver@demo.local",
      name: "Driver Demo",
      passwordHash: adminPassword
    }
  });

  const verifier = await prisma.platformUser.upsert({
    where: { email: "verifier@demo.local" },
    update: { name: "Verifier Demo", passwordHash: adminPassword, isActive: true },
    create: {
      email: "verifier@demo.local",
      name: "Verifier Demo",
      passwordHash: adminPassword
    }
  });

  const tenant = await prisma.tenant.upsert({
    where: { code: "SPPG-DEMO" },
    update: { name: "SPPG Demo Jakarta", picName: "Budi", picContact: "08123456789" },
    create: {
      code: "SPPG-DEMO",
      name: "SPPG Demo Jakarta",
      picName: "Budi",
      picContact: "08123456789",
      timezone: "Asia/Jakarta"
    }
  });

  await prisma.tenantSetting.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id, lockAfterVerified: true }
  });

  const ownerRole = await prisma.tenantRole.findUniqueOrThrow({ where: { code: "TENANT_OWNER" } });
  const driverRole = await prisma.tenantRole.findUniqueOrThrow({ where: { code: "TENANT_DRIVER" } });
  const verifierRole = await prisma.tenantRole.findUniqueOrThrow({ where: { code: "SCHOOL_VERIFIER" } });

  const ownerMember = await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: tenantOwner.id } },
    update: { isDefault: true, status: "ACTIVE" },
    create: { tenantId: tenant.id, userId: tenantOwner.id, isDefault: true, status: "ACTIVE" }
  });

  const driverMember = await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: driver.id } },
    update: { status: "ACTIVE" },
    create: { tenantId: tenant.id, userId: driver.id, status: "ACTIVE" }
  });

  const verifierMember = await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: verifier.id } },
    update: { status: "ACTIVE" },
    create: { tenantId: tenant.id, userId: verifier.id, status: "ACTIVE" }
  });

  await prisma.tenantMemberRole.upsert({
    where: { memberId_roleId: { memberId: ownerMember.id, roleId: ownerRole.id } },
    update: {},
    create: { memberId: ownerMember.id, roleId: ownerRole.id }
  });

  await prisma.tenantMemberRole.upsert({
    where: { memberId_roleId: { memberId: driverMember.id, roleId: driverRole.id } },
    update: {},
    create: { memberId: driverMember.id, roleId: driverRole.id }
  });

  await prisma.tenantMemberRole.upsert({
    where: { memberId_roleId: { memberId: verifierMember.id, roleId: verifierRole.id } },
    update: {},
    create: { memberId: verifierMember.id, roleId: verifierRole.id }
  });

  const schoolA = await prisma.school.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "SCH-A" } },
    update: { name: "SDN 01 Demo" },
    create: { tenantId: tenant.id, code: "SCH-A", name: "SDN 01 Demo", address: "Jl. Demo 1" }
  });

  const schoolB = await prisma.school.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "SCH-B" } },
    update: { name: "SDN 02 Demo" },
    create: { tenantId: tenant.id, code: "SCH-B", name: "SDN 02 Demo", address: "Jl. Demo 2" }
  });

  const route = await prisma.route.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "RUTE-1" } },
    update: { name: "Rute Pagi" },
    create: { tenantId: tenant.id, code: "RUTE-1", name: "Rute Pagi" }
  });

  await prisma.routeStop.upsert({
    where: { routeId_schoolId: { routeId: route.id, schoolId: schoolA.id } },
    update: { stopOrder: 1, tenantId: tenant.id },
    create: { tenantId: tenant.id, routeId: route.id, schoolId: schoolA.id, stopOrder: 1 }
  });

  await prisma.routeStop.upsert({
    where: { routeId_schoolId: { routeId: route.id, schoolId: schoolB.id } },
    update: { stopOrder: 2, tenantId: tenant.id },
    create: { tenantId: tenant.id, routeId: route.id, schoolId: schoolB.id, stopOrder: 2 }
  });

  const starter = await prisma.subscriptionPlan.upsert({
    where: { code: "STARTER" },
    update: { name: "Starter", price: 499000 as any, interval: "MONTHLY", active: true },
    create: { code: "STARTER", name: "Starter", price: 499000 as any, interval: "MONTHLY", active: true }
  });

  await prisma.planLimit.upsert({
    where: { planId_key: { planId: starter.id, key: "max_users" } },
    update: { limitValue: 3 },
    create: { planId: starter.id, key: "max_users", limitValue: 3 }
  });

  await prisma.planLimit.upsert({
    where: { planId_key: { planId: starter.id, key: "max_schools" } },
    update: { limitValue: 10 },
    create: { planId: starter.id, key: "max_schools", limitValue: 10 }
  });

  const latestSubscription = await prisma.subscription.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" }
  });

  if (latestSubscription) {
    await prisma.subscription.update({
      where: { id: latestSubscription.id },
      data: {
        planId: starter.id,
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        graceUntil: null
      }
    });
  } else {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: starter.id,
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        graceUntil: null,
        autoRenew: false
      }
    });
  }

  console.log("Seed selesai");
  console.log("Platform Admin: platform.admin@mbg.local / Admin#12345");
  console.log("Platform Ops: platform.ops@mbg.local / Admin#12345");
  console.log("Tenant Owner: admin@demo.local / Admin#12345");
  console.log("Tenant Driver: driver@demo.local / Admin#12345");
  console.log("School Verifier: verifier@demo.local / Admin#12345");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

