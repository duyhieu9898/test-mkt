-- P2: Brand IQ = product-marketing++
-- Adds product-marketing depth to brand_iq_profiles:
-- JTBD Four Forces, verbatim customer language, anti-personas, objections.
-- Nullable / defaulted so existing rows stay valid.

ALTER TABLE "brand_iq_profiles" ADD COLUMN IF NOT EXISTS "jtbd_forces" jsonb;
ALTER TABLE "brand_iq_profiles" ADD COLUMN IF NOT EXISTS "customer_language" jsonb;
ALTER TABLE "brand_iq_profiles" ADD COLUMN IF NOT EXISTS "anti_personas" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "brand_iq_profiles" ADD COLUMN IF NOT EXISTS "objections" jsonb DEFAULT '[]'::jsonb NOT NULL;
