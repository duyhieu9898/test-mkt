UPDATE "trustai_credit_plans"
SET
  "monthly_grant" = 1000,
  "features" = '["1,000 credits per month","1 Business Brain","Cloud mode only","Community support"]'::jsonb,
  "updated_at" = NOW()
WHERE "key" = 'free' AND "monthly_grant" < 1000;
--> statement-breakpoint
UPDATE "trustai_credit_balances"
SET
  "monthly_balance" = "monthly_balance" + (1000 - "monthly_grant"),
  "monthly_grant" = 1000,
  "updated_at" = NOW()
WHERE "plan" = 'free' AND "monthly_grant" < 1000;
