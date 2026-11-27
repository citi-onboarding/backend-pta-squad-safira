process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/distrilux_portal_test";
process.env.CORS_ORIGINS ??= "http://localhost:5173";
process.env.ERP_API_URL ??= "https://erp.example.com";
process.env.ERP_API_KEY ??= "erp-test-key";
process.env.LOG_LEVEL ??= "silent";
