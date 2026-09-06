import { PrismaClient } from "../app/generated/prisma/client";
import { brandTemplates, brandAgencyTemplates, creatorTemplates } from "../lib/defaultTemplates";

const prisma = new PrismaClient();

async function main() {
  for (const t of brandTemplates) {
    await prisma.template.upsert({
      where: {
        outreachType_recipientType_step_version: {
          outreachType: "BRAND",
          recipientType: "DIRECT",
          step: t.step,
          version: 1,
        },
      },
      update: {},
      create: { outreachType: "BRAND", recipientType: "DIRECT", version: 1, isActive: true, ...t },
    });
  }
  for (const t of brandAgencyTemplates) {
    await prisma.template.upsert({
      where: {
        outreachType_recipientType_step_version: {
          outreachType: "BRAND",
          recipientType: "AGENCY",
          step: t.step,
          version: 1,
        },
      },
      update: {},
      create: { outreachType: "BRAND", recipientType: "AGENCY", version: 1, isActive: true, ...t },
    });
  }
  for (const t of creatorTemplates) {
    await prisma.template.upsert({
      where: {
        outreachType_recipientType_step_version: {
          outreachType: "CREATOR",
          recipientType: "DIRECT",
          step: t.step,
          version: 1,
        },
      },
      update: {},
      create: { outreachType: "CREATOR", recipientType: "DIRECT", version: 1, isActive: true, ...t },
    });
  }

  await prisma.automationSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  console.log("Seed complete: 12 templates (Brand Direct + Brand Agency + Creator) + default automation settings.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
