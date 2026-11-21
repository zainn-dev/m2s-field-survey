-- AlterTable
ALTER TABLE "Survey" ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "gpsAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "gpsCapturedAt" TIMESTAMP(3),
ADD COLUMN     "gpsConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gpsLat" DOUBLE PRECISION,
ADD COLUMN     "gpsLng" DOUBLE PRECISION,
ADD COLUMN     "gpsPermissionStatus" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);
