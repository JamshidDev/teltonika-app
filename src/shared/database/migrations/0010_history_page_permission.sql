-- "Tarix" sahifasi uchun alohida ruxsat. Idempotent — qayta ishga tushirish xavfsiz.
-- history:read xaritadagi "Yo'l" tabining ma'lumotiga kirish uchun qoladi,
-- history-page:read esa alohida Tarix sahifasini ochish uchun kerak.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'history-page:read')
WHERE "name" = 'Admin'
  AND NOT ('history-page:read' = ANY ("permissions"));
