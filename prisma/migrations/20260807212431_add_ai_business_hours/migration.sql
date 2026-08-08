-- Horario de funcionamiento de la IA (AgentSettings)
ALTER TABLE "AgentSettings"
  ADD COLUMN "businessHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "businessHoursStart" TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN "businessHoursEnd" TEXT NOT NULL DEFAULT '18:00',
  ADD COLUMN "businessHoursDays" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::INTEGER[],
  ADD COLUMN "businessHoursAwayMessage" TEXT NOT NULL DEFAULT 'Gracias por tu mensaje. En este momento estamos fuera de nuestro horario de atención — te responderemos en cuanto abramos.';
