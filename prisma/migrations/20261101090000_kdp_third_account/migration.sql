-- A third KDP account ("third"), allowed wherever an account is stored.
ALTER TABLE "KdpTask" DROP CONSTRAINT "KdpTask_account_check";
ALTER TABLE "KdpTask" ADD CONSTRAINT "KdpTask_account_check" CHECK ("account" IN ('main', 'secondary', 'third'));
ALTER TABLE "KdpBook" DROP CONSTRAINT "KdpBook_account_check";
ALTER TABLE "KdpBook" ADD CONSTRAINT "KdpBook_account_check" CHECK ("account" IN ('main', 'secondary', 'third'));
ALTER TABLE "KdpSale" DROP CONSTRAINT "KdpSale_account_check";
ALTER TABLE "KdpSale" ADD CONSTRAINT "KdpSale_account_check" CHECK ("account" IN ('main', 'secondary', 'third'));
ALTER TABLE "KdpTitleAlias" DROP CONSTRAINT "KdpTitleAlias_account_check";
ALTER TABLE "KdpTitleAlias" ADD CONSTRAINT "KdpTitleAlias_account_check" CHECK ("account" IN ('main', 'secondary', 'third'));
ALTER TABLE "KdpAdSpend" DROP CONSTRAINT "KdpAdSpend_account_check";
ALTER TABLE "KdpAdSpend" ADD CONSTRAINT "KdpAdSpend_account_check" CHECK ("account" IN ('main', 'secondary', 'third'));
