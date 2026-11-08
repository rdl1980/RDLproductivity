-- AlterTable
ALTER TABLE "KdpTask" ADD COLUMN     "formats" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "KdpTask" ADD CONSTRAINT "KdpTask_formats_check" CHECK ("formats" <@ ARRAY['ebook', 'paperback', 'hardcover']::TEXT[]);
